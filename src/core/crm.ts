import type { ActivityType, ContactType, LeadStage } from "@/core/constants";
import { findDuplicateContact, findDuplicateOrg } from "@/core/dedupe";
import { findDncMatch, type DncEntry } from "@/core/dnc";
import { normalizeDomain, normalizeEmail, normalizeLinkedIn, normalizeOrgName, normalizePersonName } from "@/core/normalize";
import { normalizeState } from "@/core/texas";
import type { Contact, Settings } from "@/core/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Supabase = SupabaseClient;

export type ActionState = { error?: string; ok?: string } | undefined;

export function fail(e: unknown): ActionState {
  // Next's redirect() works by throwing; never swallow it.
  if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) {
    throw e;
  }
  const message = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : String(e);
  return { error: message };
}

/** Throw on a Supabase error so callers can use try/catch. */
export function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export async function getSettings(supabase: Supabase): Promise<Settings> {
  const existing = await supabase.from("settings").select("*").maybeSingle();
  if (existing.data) return existing.data as Settings;
  return must(await supabase.from("settings").insert({}).select("*").single()) as Settings;
}

export async function getDncEntries(supabase: Supabase): Promise<DncEntry[]> {
  return must(await supabase.from("do_not_contact").select("kind, value_normalized, reason")) as DncEntry[];
}

export async function logActivity(
  supabase: Supabase,
  a: { contact_id?: string | null; lead_id?: string | null; type: ActivityType; body?: string | null; metadata?: object; occurred_at?: string },
) {
  must(await supabase.from("activities").insert(a));
  if (a.contact_id && a.type !== "stage_change" && a.type !== "import") {
    // Keep referral partner "last touch" fresh.
    await supabase
      .from("referral_partners")
      .update({ last_touch_at: a.occurred_at ?? new Date().toISOString() })
      .eq("contact_id", a.contact_id);
  }
}

export interface OrgInput {
  name: string;
  industry?: string | null;
  city?: string | null;
  county?: string | null;
  state?: string | null;
  website?: string | null;
  size_estimate?: string | null;
  is_faith_based?: boolean;
  source: string;
  source_detail?: string | null;
}

/** Find an existing organization (domain, or name + city) or create one. */
export async function findOrCreateOrg(supabase: Supabase, input: OrgInput): Promise<{ id: string; created: boolean }> {
  const name_normalized = normalizeOrgName(input.name);
  const domain = normalizeDomain(input.website);
  const filters = [`name_normalized.eq.${JSON.stringify(name_normalized)}`];
  if (domain) filters.push(`domain.eq.${JSON.stringify(domain)}`);
  const candidates = must(
    await supabase.from("organizations").select("id, name, website, domain, city").or(filters.join(",")),
  ) as { id: string; name: string; website: string | null; domain: string | null; city: string | null }[];
  const dup = findDuplicateOrg({ name: input.name, website: input.website, city: input.city }, candidates);
  if (dup) return { id: dup.record.id, created: false };

  const row = must(
    await supabase
      .from("organizations")
      .insert({ ...input, state: normalizeState(input.state), name_normalized, domain })
      .select("id")
      .single(),
  ) as { id: string };
  return { id: row.id, created: true };
}

export interface ContactInput {
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  email?: string | null;
  email_source?: string | null;
  linkedin_url?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  contact_type: ContactType;
  source: string;
  consent_note: string;
  org_id?: string | null;
}

export function contactFields(input: ContactInput) {
  const li = normalizeLinkedIn(input.linkedin_url);
  return {
    ...input,
    email: normalizeEmail(input.email) ?? (input.email?.trim() || null),
    linkedin_url: li ? `https://www.${li}` : input.linkedin_url?.trim() || null,
    state: normalizeState(input.state),
    name_normalized: normalizePersonName(input.first_name, input.last_name),
  };
}

export interface UpsertContactResult {
  id: string;
  created: boolean;
  duplicateReason?: string;
  dncFlagged: boolean;
}

/**
 * Create a contact unless the same person already exists (email, LinkedIn, or
 * name + organization). New contacts that match the do-not-contact list are
 * stored but flagged so nothing can ever be drafted for them.
 */
export async function upsertContact(
  supabase: Supabase,
  input: ContactInput,
  ctx: { orgName?: string | null; orgWebsite?: string | null; dnc?: DncEntry[] },
): Promise<UpsertContactResult> {
  const fields = contactFields(input);
  const filters: string[] = [];
  if (fields.email) filters.push(`email.ilike.${JSON.stringify(fields.email)}`);
  if (fields.linkedin_url) filters.push(`linkedin_url.eq.${JSON.stringify(fields.linkedin_url)}`);
  if (fields.name_normalized) filters.push(`name_normalized.eq.${JSON.stringify(fields.name_normalized)}`);

  if (filters.length) {
    const candidates = must(
      await supabase
        .from("contacts")
        .select("id, first_name, last_name, email, linkedin_url, organizations(name)")
        .or(filters.join(",")),
    ) as unknown as (Pick<Contact, "id" | "first_name" | "last_name" | "email" | "linkedin_url"> & {
      organizations: { name: string } | null;
    })[];
    const dup = findDuplicateContact(
      { ...fields, org_name: ctx.orgName },
      candidates.map((c) => ({ ...c, org_name: c.organizations?.name ?? null })),
    );
    if (dup) return { id: dup.record.id, created: false, duplicateReason: dup.reason, dncFlagged: false };
  }

  const dnc = ctx.dnc ?? (await getDncEntries(supabase));
  const hit = findDncMatch(fields, dnc, ctx.orgName, ctx.orgWebsite);
  const row = must(
    await supabase
      .from("contacts")
      .insert({
        ...fields,
        do_not_contact: Boolean(hit),
        dnc_reason: hit ? `Matched DNC list (${hit.kind}: ${hit.value_normalized})` : null,
      })
      .select("id")
      .single(),
  ) as { id: string };
  return { id: row.id, created: true, dncFlagged: Boolean(hit) };
}

/**
 * After the DNC list changes: flag every matching contact and pull any of
 * their drafts out of the queue.
 */
export async function applyDncList(supabase: Supabase): Promise<number> {
  const dnc = await getDncEntries(supabase);
  if (!dnc.length) return 0;
  const contacts = must(
    await supabase
      .from("contacts")
      .select("id, first_name, last_name, email, linkedin_url, do_not_contact, organizations(name, website)")
      .eq("do_not_contact", false),
  ) as unknown as (Contact & { organizations: { name: string; website: string | null } | null })[];

  let flagged = 0;
  for (const c of contacts) {
    const hit = findDncMatch(c, dnc, c.organizations?.name, c.organizations?.website);
    if (!hit) continue;
    await blockContact(supabase, c.id, `Matched DNC list (${hit.kind}: ${hit.value_normalized})`);
    flagged++;
  }
  return flagged;
}

export async function blockContact(supabase: Supabase, contactId: string, reason: string) {
  must(
    await supabase
      .from("drafts")
      .update({ status: "blocked_dnc" })
      .eq("contact_id", contactId)
      .in("status", ["pending_approval", "approved"]),
  );
  must(await supabase.from("contacts").update({ do_not_contact: true, dnc_reason: reason }).eq("id", contactId));
  await logActivity(supabase, { contact_id: contactId, type: "dnc", body: reason });
}

export async function setLeadStage(supabase: Supabase, leadId: string, stage: LeadStage, note?: string) {
  const lead = must(await supabase.from("leads").select("id, contact_id, stage").eq("id", leadId).single()) as {
    id: string;
    contact_id: string;
    stage: LeadStage;
  };
  if (lead.stage === stage) return;
  must(await supabase.from("leads").update({ stage }).eq("id", leadId));
  await logActivity(supabase, {
    contact_id: lead.contact_id,
    lead_id: leadId,
    type: "stage_change",
    body: note ?? `${lead.stage} → ${stage}`,
    metadata: { from: lead.stage, to: stage },
  });
}
