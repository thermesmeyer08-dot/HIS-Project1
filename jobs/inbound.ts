/**
 * Inbound job (hourly):
 *   1. Website calculator emails (Gmail)  -> contacts, leads, timeline
 *   2. Booked appointments (Google Calendar) -> contacts, leads -> "Meeting booked"
 *   3. Calculator leads who haven't booked -> follow-up email DRAFT in the approval queue
 *   4. Upcoming meetings -> call prep brief on the lead
 *
 * It never sends anything. Run locally with:  npm run job:inbound
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { addUsage, generateCallPrepBrief, generateFollowUp, hasAnthropicKey, type Usage } from "@/core/ai";
import { withEmailFooter } from "@/core/compliance";
import type { LeadStage } from "@/core/constants";
import {
  getDncEntries,
  getSettings,
  logActivity,
  must,
  setLeadStage,
  upsertContact,
  type ContactInput,
} from "@/core/crm";
import { decryptSecret } from "@/core/crypto";
import { findDncMatch, type DncEntry } from "@/core/dnc";
import { calendarEvents, gmailGet, gmailSearch, refreshAccessToken, type CalendarEvent } from "@/core/google";
import { isBookingDescription, nameFromBookingTitle, parseBookingDescription, type BookingDetails } from "@/core/parsers/booking";
import { isCalculatorEmail, parseCalculatorEmail, type CalculatorSubmission } from "@/core/parsers/calculator";
import { splitName } from "@/core/parsers/shared";
import { callPrepTemplate, followUpTemplate } from "@/core/templates";
import { isTexas } from "@/core/texas";
import type { Settings } from "@/core/types";
import { addDays, formatDateTime, todayCentral } from "@/lib/format";
import { log, requireEnv, signInAsOwner, spentToday, startJobRun, type JobRunHandle } from "./lib";

const CALC_SOURCE = "Website calculator (hermesmeyerinsurance.com)";
const BOOKING_SOURCE = "Website booking page (Google Calendar)";
const PRE_MEETING: LeadStage[] = ["new", "researched", "drafted", "contacted", "replied", "nurture", "lost"];
const MAX_FOLLOWUPS_PER_RUN = 10;
const MAX_BRIEFS_PER_RUN = 5;

type Db = SupabaseClient;

interface Ctx {
  db: Db;
  settings: Settings;
  dnc: DncEntry[];
  run: JobRunHandle;
  budgetLeft: () => number;
  spend: (u: Usage) => void;
}

// ------------------------------------------------------------------ helpers

function centralDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(iso));
}

async function openLeadFor(db: Db, contactId: string) {
  const rows = must(
    await db
      .from("leads")
      .select("id, stage, org_id")
      .eq("contact_id", contactId)
      .not("stage", "in", "(placed,lost)")
      .order("created_at", { ascending: false })
      .limit(1),
  ) as { id: string; stage: LeadStage; org_id: string | null }[];
  return rows[0] ?? null;
}

/** Fill phone/name on an existing contact if they were blank. Never overwrites Tim's edits. */
async function backfillContact(db: Db, id: string, fields: Partial<ContactInput>) {
  const c = must(await db.from("contacts").select("first_name, last_name, phone").eq("id", id).single()) as {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  };
  const patch: Record<string, string> = {};
  if (!c.phone && fields.phone) patch.phone = fields.phone;
  if (!c.first_name && fields.first_name) patch.first_name = fields.first_name;
  if (!c.last_name && fields.last_name) patch.last_name = fields.last_name;
  if (Object.keys(patch).length) must(await db.from("contacts").update(patch).eq("id", id));
}

// ------------------------------------------------------------------ 1. calculator emails

async function processCalculatorEmails(ctx: Ctx, token: string) {
  const { db, settings } = ctx;
  const q = `${settings.inbound_gmail_query} newer_than:${settings.inbound_lookback_days}d`;
  const ids = await gmailSearch(token, q, 100);
  if (!ids.length) return 0;
  const seen = new Set(
    (must(await db.from("inbound_events").select("gmail_message_id").in("gmail_message_id", ids.map((m) => m.id))) as {
      gmail_message_id: string;
    }[]).map((r) => r.gmail_message_id),
  );

  let n = 0;
  for (const { id } of ids.filter((m) => !seen.has(m.id))) {
    const msg = await gmailGet(token, id);
    if (!isCalculatorEmail(msg.from, msg.subject, msg.text)) continue;
    const p = parseCalculatorEmail(msg.text);
    if (!p) {
      log(`Skipped calculator email ${id}: no email address found`);
      continue;
    }
    await handleCalculator(ctx, p, msg.id, new Date(Number(msg.internalDate)).toISOString(), msg.text);
    n++;
  }
  return n;
}

async function handleCalculator(ctx: Ctx, p: CalculatorSubmission, gmailId: string, receivedAt: string, raw: string) {
  const { db, dnc } = ctx;
  const when = formatDateTime(receivedAt);
  const fields: ContactInput = {
    first_name: p.first_name,
    last_name: p.last_name,
    email: p.email,
    phone: p.phone,
    contact_type: "prospect",
    source: CALC_SOURCE,
    consent_note: p.consent
      ? `Submitted the website coverage calculator on ${when} and checked the consent box.`
      : `Submitted the website coverage calculator on ${when}. Consent box NOT checked.`,
  };
  const c = await upsertContact(db, fields, { dnc });
  if (!c.created) await backfillContact(db, c.id, fields);

  let lead = await openLeadFor(db, c.id);
  if (!lead) {
    lead = must(
      await db
        .from("leads")
        .insert({
          contact_id: c.id,
          niche: p.niche ?? "other",
          next_action: "Follow up on calculator submission",
          next_action_date: todayCentral(),
        })
        .select("id, stage, org_id")
        .single(),
    ) as { id: string; stage: LeadStage; org_id: string | null };
  }

  const { raw_fields: _raw, ...parsed } = p;
  void _raw;
  must(
    await db.from("inbound_events").insert({
      kind: "calculator",
      gmail_message_id: gmailId,
      raw_excerpt: raw.slice(0, 4000),
      parsed: { ...parsed, received_at: receivedAt },
      contact_id: c.id,
      lead_id: lead.id,
      processed_at: new Date().toISOString(),
    }),
  );
  const est = p.estimate ? `$${p.estimate.toLocaleString("en-US")}` : (p.estimate_text ?? "no estimate");
  await logActivity(db, {
    contact_id: c.id,
    lead_id: lead.id,
    type: "inbound",
    body: `Website calculator: ${est}${p.path ? ` for ${p.path.toLowerCase()}` : ""}${p.term ? `, ${p.term}` : ""}.${p.consent ? "" : " (Consent box not checked.)"}`,
    occurred_at: receivedAt,
  });
  log(`Calculator lead ${c.created ? "created" : "updated"}: lead ${lead.id}`);
}

// ------------------------------------------------------------------ 2. calendar bookings

async function processBookings(ctx: Ctx, token: string) {
  const { db, settings } = ctx;
  const now = Date.now();
  const events = await calendarEvents(
    token,
    new Date(now - settings.inbound_lookback_days * 864e5),
    new Date(now + 90 * 864e5),
  );
  const match = settings.booking_title_match.toLowerCase();
  const bookings = events.filter(
    (e) => (e.summary ?? "").toLowerCase().includes(match) && isBookingDescription(e.description),
  );
  if (!bookings.length) return 0;

  const existing = new Map(
    (must(
      await db
        .from("inbound_events")
        .select("id, calendar_event_id, parsed, contact_id, lead_id")
        .in("calendar_event_id", bookings.map((b) => b.id)),
    ) as { id: string; calendar_event_id: string; parsed: Record<string, unknown>; contact_id: string; lead_id: string }[]).map(
      (r) => [r.calendar_event_id, r],
    ),
  );

  let n = 0;
  for (const ev of bookings) {
    const prev = existing.get(ev.id);
    const start = ev.start?.dateTime ?? ev.start?.date ?? null;
    if (!prev) {
      if (ev.status === "cancelled") continue; // booked and cancelled before we saw it
      await handleNewBooking(ctx, ev);
      n++;
      continue;
    }
    // Cancelled since we last looked.
    if (ev.status === "cancelled" && !prev.parsed.cancelled) {
      must(await db.from("inbound_events").update({ parsed: { ...prev.parsed, cancelled: true } }).eq("id", prev.id));
      if (prev.lead_id) {
        must(
          await db
            .from("leads")
            .update({ next_action: "Booking was cancelled: reach out to reschedule", next_action_date: todayCentral() })
            .eq("id", prev.lead_id),
        );
      }
      await logActivity(db, { contact_id: prev.contact_id, lead_id: prev.lead_id, type: "meeting", body: "Booked coverage review was cancelled." });
      n++;
      continue;
    }
    // Rescheduled.
    if (ev.status !== "cancelled" && start && start !== prev.parsed.start) {
      must(await db.from("inbound_events").update({ parsed: { ...prev.parsed, start, cancelled: false } }).eq("id", prev.id));
      if (prev.lead_id) {
        must(await db.from("leads").update({ next_action_date: centralDate(start), call_prep_brief: null }).eq("id", prev.lead_id));
      }
      await logActivity(db, {
        contact_id: prev.contact_id,
        lead_id: prev.lead_id,
        type: "meeting",
        body: `Coverage review rescheduled to ${formatDateTime(start)}.`,
      });
      n++;
    }
  }
  return n;
}

async function handleNewBooking(ctx: Ctx, ev: CalendarEvent) {
  const { db, dnc } = ctx;
  const b: BookingDetails = parseBookingDescription(ev.description!) ?? {
    kind: "booking",
    name: null,
    first_name: null,
    last_name: null,
    email: null,
    phone: null,
    answers: [],
    niche: null,
    calculator_amount: null,
    calculator_answer: null,
  };
  const name = b.name ?? nameFromBookingTitle(ev.summary);
  const email = b.email ?? ev.attendees?.find((a) => !a.self && !a.organizer)?.email?.toLowerCase() ?? null;
  const start = ev.start?.dateTime ?? ev.start?.date ?? new Date().toISOString();
  const { first_name, last_name } = b.first_name || b.last_name ? b : splitName(name);

  const fields: ContactInput = {
    first_name,
    last_name,
    email,
    phone: b.phone,
    contact_type: "prospect",
    source: BOOKING_SOURCE,
    consent_note: `Booked a free coverage review through the website booking page for ${formatDateTime(start)}.`,
  };
  const c = await upsertContact(db, fields, { dnc });
  if (!c.created) await backfillContact(db, c.id, fields);

  let lead = await openLeadFor(db, c.id);
  if (!lead) {
    lead = must(
      await db
        .from("leads")
        .insert({ contact_id: c.id, niche: b.niche ?? "other" })
        .select("id, stage, org_id")
        .single(),
    ) as { id: string; stage: LeadStage; org_id: string | null };
  }
  if (PRE_MEETING.includes(lead.stage)) await setLeadStage(db, lead.id, "meeting_booked", "Booked a coverage review");
  must(
    await db
      .from("leads")
      .update({ next_action: "Free 20-minute coverage review", next_action_date: centralDate(start) })
      .eq("id", lead.id),
  );

  must(
    await db.from("inbound_events").insert({
      kind: "booking",
      calendar_event_id: ev.id,
      raw_excerpt: (ev.description ?? "").slice(0, 4000),
      parsed: {
        ...b,
        name,
        email,
        start,
        end: ev.end?.dateTime ?? ev.end?.date ?? null,
        meet_link: ev.hangoutLink ?? null,
        html_link: ev.htmlLink ?? null,
        cancelled: false,
      },
      contact_id: c.id,
      lead_id: lead.id,
      processed_at: new Date().toISOString(),
    }),
  );
  await logActivity(db, {
    contact_id: c.id,
    lead_id: lead.id,
    type: "meeting",
    body: `Booked: free 20-minute coverage review on ${formatDateTime(start)}.`,
  });
  log(`Booking ${c.created ? "created" : "matched"} lead ${lead.id}`);
}

// ------------------------------------------------------------------ 3. follow-up drafts

async function draftFollowUps(ctx: Ctx) {
  const { db, settings, dnc } = ctx;
  const cutoff = new Date(Date.now() - settings.followup_delay_hours * 3600e3).toISOString();
  const calcs = must(
    await db
      .from("inbound_events")
      .select("id, parsed, contact_id, lead_id")
      .eq("kind", "calculator")
      .not("lead_id", "is", null)
      .lte("processed_at", cutoff)
      .order("processed_at", { ascending: false })
      .limit(50),
  ) as { id: string; parsed: CalculatorSubmission & { received_at: string }; contact_id: string; lead_id: string }[];

  let n = 0;
  for (const ev of calcs) {
    if (n >= MAX_FOLLOWUPS_PER_RUN) break;
    if (!ev.parsed.consent) continue; // only follow up when they opted in

    const [lead, bookings, drafts, contact] = await Promise.all([
      db.from("leads").select("id, stage").eq("id", ev.lead_id).maybeSingle(),
      db.from("inbound_events").select("id").eq("kind", "booking").eq("contact_id", ev.contact_id).limit(1),
      db.from("drafts").select("id").eq("lead_id", ev.lead_id).limit(1),
      db
        .from("contacts")
        .select("first_name, last_name, email, linkedin_url, do_not_contact, state, organizations(name, website)")
        .eq("id", ev.contact_id)
        .single(),
    ]);
    if (!lead.data || !["new", "researched"].includes(lead.data.stage)) continue;
    if (bookings.data?.length || drafts.data?.length) continue;
    const c = contact.data as unknown as {
      first_name: string | null;
      email: string | null;
      do_not_contact: boolean;
      state: string | null;
      organizations: { name: string; website: string | null } | null;
    } & Record<string, unknown>;
    if (!c?.email) continue;
    if (findDncMatch(c, dnc, c.organizations?.name, c.organizations?.website)) continue;
    if (isTexas(c.state) === false) continue;

    let subject: string;
    let body: string;
    let model = "template";
    const facts = [
      `First name: ${c.first_name ?? "(not given)"}`,
      ev.parsed.path && `Calculator path: ${ev.parsed.path}`,
      ev.parsed.estimate && `Calculator estimate: $${ev.parsed.estimate.toLocaleString("en-US")}`,
      ev.parsed.term && `Term chosen: ${ev.parsed.term}`,
      ev.parsed.details && `Breakdown: ${ev.parsed.details}`,
    ]
      .filter(Boolean)
      .join("\n");
    if (hasAnthropicKey() && ctx.budgetLeft() > 0.05) {
      try {
        const out = await generateFollowUp({ model: settings.research_model, facts });
        ctx.spend(out.usage);
        ({ subject, body } = out);
        model = settings.research_model;
      } catch (e) {
        log(`AI follow-up failed, using template: ${e instanceof Error ? e.message : e}`);
        ({ subject, body } = followUpTemplate(ev.parsed));
      }
    } else {
      ({ subject, body } = followUpTemplate(ev.parsed));
    }
    const greeting = c.first_name ? `Hi ${c.first_name},` : "Hi,";
    if (!/^\s*(hi|hello|dear)\b/i.test(body)) body = `${greeting}\n\n${body}`;
    const full = withEmailFooter(body, settings);

    must(
      await db.from("drafts").insert({
        contact_id: ev.contact_id,
        lead_id: ev.lead_id,
        channel: "email",
        sequence_step: 0,
        subject,
        body: full,
        original_body: full,
        model,
      }),
    );
    await setLeadStage(db, ev.lead_id, "drafted", "Follow-up draft created for calculator lead");
    n++;
    log(`Follow-up drafted for lead ${ev.lead_id} (${model})`);
  }
  return n;
}

// ------------------------------------------------------------------ 4. call prep briefs

async function writeBriefs(ctx: Ctx) {
  const { db, settings } = ctx;
  const today = todayCentral();
  const leads = must(
    await db
      .from("leads")
      .select("id, contact_id, org_id, niche, next_action_date, owner_notes")
      .eq("stage", "meeting_booked")
      .is("call_prep_brief", null)
      .gte("next_action_date", today)
      .lte("next_action_date", addDays(today, settings.brief_days_ahead))
      .order("next_action_date")
      .limit(MAX_BRIEFS_PER_RUN),
  ) as { id: string; contact_id: string; org_id: string | null; niche: string; next_action_date: string; owner_notes: string | null }[];

  let n = 0;
  for (const l of leads) {
    const [c, org, events, acts] = await Promise.all([
      db.from("contacts").select("first_name, last_name, title, email, phone, city, state").eq("id", l.contact_id).single(),
      l.org_id ? db.from("organizations").select("name, website, industry, city").eq("id", l.org_id).single() : Promise.resolve({ data: null }),
      db.from("inbound_events").select("kind, parsed").eq("lead_id", l.id).order("created_at"),
      db.from("activities").select("type, body, occurred_at").eq("lead_id", l.id).order("occurred_at", { ascending: false }).limit(10),
    ]);
    const contact = c.data as Record<string, string | null>;
    const name = `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() || "(no name)";
    const evs = (events.data ?? []) as { kind: string; parsed: Record<string, unknown> }[];
    const calc = evs.find((e) => e.kind === "calculator")?.parsed as (CalculatorSubmission & Record<string, unknown>) | undefined;
    const booking = [...evs].reverse().find((e) => e.kind === "booking")?.parsed as (BookingDetails & { start?: string }) | undefined;
    const meeting = booking?.start ? formatDateTime(booking.start) : l.next_action_date;
    const emailDomain = contact.email?.split("@")[1] ?? null;
    const freeMail = /^(gmail|yahoo|outlook|hotmail|icloud|aol|me|live|msn|proton|protonmail)\./i.test(emailDomain ?? "");

    const facts = [
      `Name: ${name}`,
      contact.title && `Title: ${contact.title}`,
      contact.email && `Email: ${contact.email}${emailDomain && !freeMail ? ` (business domain: ${emailDomain})` : ""}`,
      contact.city && `City: ${contact.city}`,
      org.data && `Business: ${JSON.stringify(org.data)}`,
      `Meeting: ${meeting}`,
      `Lead type: ${l.niche}`,
      calc && `Calculator submission: ${JSON.stringify({ path: calc.path, estimate: calc.estimate, term: calc.term, details: calc.details })}`,
      booking?.answers?.length && `Booking form answers: ${booking.answers.map((a) => `${a.question} ${a.answer}`).join(" | ")}`,
      l.owner_notes && `Tim's notes: ${l.owner_notes}`,
      acts.data?.length && `Recent activity: ${acts.data.map((a: { type: string; body: string }) => `${a.type}: ${a.body}`).join(" | ")}`,
    ]
      .filter(Boolean)
      .join("\n");

    let brief: string;
    let by = "template";
    if (hasAnthropicKey() && ctx.budgetLeft() > 0.25) {
      try {
        const out = await generateCallPrepBrief({ model: settings.research_model, maxSearches: settings.max_searches_per_prospect, facts });
        ctx.spend(out.usage);
        brief = out.text;
        by = settings.research_model;
      } catch (e) {
        log(`AI brief failed, using template: ${e instanceof Error ? e.message : e}`);
        brief = callPrepTemplate({ name, email: contact.email, phone: contact.phone, meeting, niche: l.niche, submitted: { ...calc, answers: booking?.answers } });
      }
    } else {
      brief = callPrepTemplate({ name, email: contact.email, phone: contact.phone, meeting, niche: l.niche, submitted: { ...calc, answers: booking?.answers } });
    }
    const stamp = `_Prepared ${formatDateTime(new Date().toISOString())} by ${by === "template" ? "template (no AI research)" : "AI with web research. Verify before relying on it"}._`;
    must(await db.from("leads").update({ call_prep_brief: `${brief}\n\n${stamp}` }).eq("id", l.id));
    n++;
    log(`Brief written for lead ${l.id} (${by})`);
  }
  return n;
}

// ------------------------------------------------------------------ main

/**
 * Local test mode (no Google needed):
 *   npm run job:inbound -- --calculator-file sample.txt   process a saved calculator email body
 *   npm run job:inbound -- --booking-file sample.txt      process a saved booking description
 *   add --no-delay to draft follow-ups immediately instead of waiting followup_delay_hours
 */
function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const calcFile = arg("--calculator-file");
  const bookingFile = arg("--booking-file");
  const localTest = Boolean(calcFile || bookingFile);
  const env = localTest ? null : requireEnv("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY");
  const session = await signInAsOwner();
  const { db } = session;
  const run = await startJobRun(db, localTest ? "inbound (local test)" : "inbound");
  try {
    const settings = await getSettings(db);
    if (process.argv.includes("--no-delay")) settings.followup_delay_hours = 0;
    const already = await spentToday(db);
    const ctxBase = { db, settings, dnc: await getDncEntries(db), run };

    if (localTest) {
      const { readFileSync } = await import("node:fs");
      const ctx: Ctx = {
        ...ctxBase,
        budgetLeft: () => Number(settings.daily_cost_cap_usd) - already - run.usage.cost_usd,
        spend: (u) => void (run.usage = addUsage(run.usage, u)),
      };
      let n = 0;
      if (calcFile) {
        const text = readFileSync(calcFile, "utf8");
        const p = parseCalculatorEmail(text);
        if (!p) throw new Error("Could not parse the calculator file (needs an Email: field).");
        await handleCalculator(ctx, p, `local-test-${Date.now()}`, new Date().toISOString(), text);
        n++;
      }
      if (bookingFile) {
        const description = readFileSync(bookingFile, "utf8");
        const start = new Date(Date.now() + 864e5).toISOString();
        await handleNewBooking(ctx, {
          id: `local-test-${Date.now()}`,
          status: "confirmed",
          summary: "Free 20-minute coverage review (local test)",
          description,
          start: { dateTime: start },
          end: { dateTime: new Date(Date.parse(start) + 20 * 60e3).toISOString() },
        });
        n++;
      }
      const follow = await draftFollowUps(ctx);
      const briefs = await writeBriefs(ctx);
      run.items = n + follow + briefs;
      log(`Local test done: ${n} inbound, ${follow} follow-up drafts, ${briefs} briefs. AI cost $${run.usage.cost_usd.toFixed(3)}`);
      await run.finish("ok");
      return;
    }

    const tok = (await db.from("oauth_tokens").select("encrypted_refresh_token").eq("provider", "google").maybeSingle()).data;
    if (!tok) {
      log("Google is not connected yet (Settings → Connect Google). Skipping.");
      await run.finish("skipped", "Google not connected");
      return;
    }
    const access = await refreshAccessToken(
      { clientId: env!.GOOGLE_CLIENT_ID, clientSecret: env!.GOOGLE_CLIENT_SECRET },
      decryptSecret(tok.encrypted_refresh_token, env!.TOKEN_ENCRYPTION_KEY),
    );
    const ctx: Ctx = {
      ...ctxBase,
      budgetLeft: () => Number(settings.daily_cost_cap_usd) - already - run.usage.cost_usd,
      spend: (u) => void (run.usage = addUsage(run.usage, u)),
    };

    const calc = await processCalculatorEmails(ctx, access);
    const book = await processBookings(ctx, access);
    const follow = await draftFollowUps(ctx);
    const briefs = await writeBriefs(ctx);
    run.items = calc + book + follow + briefs;
    log(`Done: ${calc} calculator, ${book} booking changes, ${follow} follow-up drafts, ${briefs} briefs. AI cost $${run.usage.cost_usd.toFixed(3)}`);
    await run.finish("ok");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`FAILED: ${msg}`);
    await run.finish("error", msg);
    process.exitCode = 1;
  } finally {
    await session.close();
  }
}

main();
