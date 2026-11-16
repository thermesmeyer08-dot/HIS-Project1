/**
 * Seed a few FAKE records for testing. Safe to re-run: it deletes previous
 * seed data (source = "seed") first. Uses the secret key, so run it locally only.
 *
 *   npm run seed
 */
import "dotenv/config";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { normalizeOrgName, normalizePersonName } from "../src/core/normalize";
import { withEmailFooter } from "../src/core/compliance";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const ownerEmail = (process.env.ALLOWED_EMAILS ?? "").split(",")[0]?.trim().toLowerCase();
if (!url || !key || !ownerEmail) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and ALLOWED_EMAILS in .env.local first.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

const SEED = "seed";
const daysFromNow = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

async function main() {
  const { data: users, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const owner = users.users.find((u) => u.email?.toLowerCase() === ownerEmail);
  if (!owner) throw new Error(`No Supabase user ${ownerEmail}. Add the user in Supabase (Authentication -> Users) first.`);
  const owner_id = owner.id;

  // Clean previous seed data (cascades to leads, drafts, activities, partners).
  await must(db.from("contacts").delete().eq("owner_id", owner_id).eq("source", SEED));
  await must(db.from("organizations").delete().eq("owner_id", owner_id).eq("source", SEED));
  await must(db.from("do_not_contact").delete().eq("owner_id", owner_id).eq("reason", "seed example"));
  await must(db.from("templates").delete().eq("owner_id", owner_id).like("name", "[Example]%"));

  const settings = await must(db.from("settings").upsert({ owner_id }, { onConflict: "owner_id" }).select("*").single());

  const orgs = [
    { name: "Example Plumbing & Air LLC", industry: "HVAC / plumbing", city: "Plano", county: "Collin", website: "example-plumbing.example" },
    { name: "Example Family Dental PLLC", industry: "Dental practice", city: "Frisco", county: "Collin", website: "example-dental.example" },
    { name: "Example Logistics Partners", industry: "Trucking", city: "Fort Worth", county: "Tarrant", website: "example-logistics.example" },
    { name: "Example CPA Group", industry: "Accounting", city: "Dallas", county: "Dallas", website: "example-cpa.example" },
    { name: "Example Oklahoma Roofing", industry: "Roofing", city: "Tulsa", county: null, website: null, state: "OK" },
  ];
  const orgRows = await must(
    db
      .from("organizations")
      .insert(orgs.map((o) => ({ state: "TX", ...o, owner_id, source: SEED, name_normalized: normalizeOrgName(o.name), domain: o.website })))
      .select("id, name"),
  );
  const org = (name: string) => orgRows.find((o) => o.name === name)!.id;

  const people = [
    { first_name: "Dana", last_name: "Sample", title: "Owner", email: "dana@example-plumbing.example", org: "Example Plumbing & Air LLC", type: "prospect" },
    { first_name: "Raj", last_name: "Placeholder", title: "Co-owner, DDS", email: null, org: "Example Family Dental PLLC", type: "prospect" },
    { first_name: "Maria", last_name: "Testcase", title: "Managing Partner", email: "maria@example-logistics.example", org: "Example Logistics Partners", type: "prospect" },
    { first_name: "Chris", last_name: "Demo", title: "CPA, Partner", email: "chris@example-cpa.example", org: "Example CPA Group", type: "referral_partner" },
    { first_name: "Pat", last_name: "Banker", title: "VP Business Banking", email: "pat@bank.example", org: null, type: "referral_partner" },
    { first_name: "Sam", last_name: "Client", title: "Owner", email: "sam@client.example", org: null, type: "client" },
    { first_name: "Olive", last_name: "Outofstate", title: "Owner", email: "olive@ok-roofing.example", org: "Example Oklahoma Roofing", type: "prospect", state: "OK" },
    { first_name: "Nora", last_name: "Optout", title: "Owner", email: "nora@optout.example", org: null, type: "prospect", dnc: true },
  ];
  const contactRows = await must(
    db
      .from("contacts")
      .insert(
        people.map((p) => ({
          owner_id,
          first_name: p.first_name,
          last_name: p.last_name,
          name_normalized: normalizePersonName(p.first_name, p.last_name),
          title: p.title,
          email: p.email,
          email_source: p.email ? "Fake seed data" : null,
          state: p.state ?? "TX",
          contact_type: p.type,
          org_id: p.org ? org(p.org) : null,
          source: SEED,
          consent_note: "Fake record created by the seed script for testing",
          do_not_contact: Boolean(p.dnc),
          dnc_reason: p.dnc ? "Replied unsubscribe (seed example)" : null,
        })),
      )
      .select("id, first_name, org_id"),
  );
  const contact = (first: string) => contactRows.find((c) => c.first_name === first)!;

  await must(
    db.from("referral_partners").insert([
      { owner_id, contact_id: contact("Chris").id, profession: "cpa", relationship_stage: "met", referrals_received: 1 },
      { owner_id, contact_id: contact("Pat").id, profession: "banker", relationship_stage: "identified" },
    ]),
  );

  const leads = await must(
    db
      .from("leads")
      .insert([
        {
          owner_id, contact_id: contact("Dana").id, org_id: contact("Dana").org_id, stage: "researched", score: 78,
          score_reasoning: "Owner-operated, 2 locations, growing; brother is co-owner (buy-sell signal).",
          product_interest: ["buy_sell", "key_person"], next_action: "Review first-touch email", next_action_date: daysFromNow(0),
        },
        {
          owner_id, contact_id: contact("Raj").id, org_id: contact("Raj").org_id, stage: "meeting_booked", score: 85,
          product_interest: ["buy_sell", "personal"], next_action: "Discovery call", next_action_date: daysFromNow(1),
          call_prep_brief: "EXAMPLE BRIEF\n- Submitted calculator: wants to protect family income\n- Practice has two dentist owners (buy-sell)\n- Ask: is there an existing buy-sell agreement? How is it funded?",
        },
        {
          owner_id, contact_id: contact("Maria").id, org_id: contact("Maria").org_id, stage: "contacted", score: 62,
          product_interest: ["exec_bonus"], next_action: "Follow up if no reply", next_action_date: daysFromNow(-2),
        },
        { owner_id, contact_id: contact("Sam").id, stage: "placed", score: 90, product_interest: ["personal"] },
        { owner_id, contact_id: contact("Olive").id, org_id: contact("Olive").org_id, stage: "new", score: 40 },
      ])
      .select("id, contact_id"),
  );
  const leadFor = (first: string) => leads.find((l) => l.contact_id === contact(first).id)!.id;

  const emailBody = withEmailFooter(
    "Hi Dana,\n\nI saw Example Plumbing & Air just opened a second location in Allen. Congratulations.\n\nWhen two owners build a business together, a lot rides on what happens if one of them can't continue. I'm an independent agent here in DFW, so I can compare options across multiple carriers rather than pitching one company's product.\n\nWould a 20-minute call be useful?",
    settings,
  );
  await must(
    db.from("drafts").insert([
      {
        owner_id, contact_id: contact("Dana").id, lead_id: leadFor("Dana"), channel: "email",
        subject: "Your second location", body: emailBody, original_body: emailBody, model: "seed",
      },
      {
        owner_id, contact_id: contact("Dana").id, lead_id: leadFor("Dana"), channel: "linkedin",
        body: "Hi Dana, congrats on the Allen location. I work with DFW business owners on planning for the what-ifs of co-ownership. Would be glad to connect.",
        original_body: null, model: "seed",
      },
      {
        owner_id, contact_id: contact("Chris").id, channel: "email", subject: "A resource for your business-owner clients",
        body: withEmailFooter("Hi Chris,\n\nThanks again for the referral last month. If it's helpful, I put together a one-page checklist on funding buy-sell agreements that your clients can use before year-end planning.", settings),
        model: "seed",
      },
    ]),
  );

  await must(
    db.from("activities").insert([
      { owner_id, contact_id: contact("Maria").id, lead_id: leadFor("Maria"), type: "email_sent", body: "First-touch email (seed example)", occurred_at: new Date(Date.now() - 6 * 864e5).toISOString() },
      { owner_id, contact_id: contact("Raj").id, lead_id: leadFor("Raj"), type: "inbound", body: "Calculator submission (seed example)" },
      { owner_id, contact_id: contact("Raj").id, lead_id: leadFor("Raj"), type: "meeting", body: "Booked discovery call (seed example)" },
      { owner_id, contact_id: contact("Chris").id, type: "meeting", body: "Coffee at Klyde Warren (seed example)", occurred_at: new Date(Date.now() - 20 * 864e5).toISOString() },
    ]),
  );

  await must(db.from("do_not_contact").insert({ owner_id, kind: "domain", value_normalized: "optout.example", reason: "seed example" }));
  await must(
    db.from("templates").insert({
      owner_id, name: "[Example] Business owner first touch", channel: "email", subject: "{business}",
      body: "Hi {first_name},\n\n{specific_detail}\n\nI'm an independent agent in DFW…", compliance_status: "draft",
    }),
  );

  console.log(`Seeded ${orgRows.length} businesses, ${contactRows.length} contacts, ${leads.length} leads, 3 drafts for ${ownerEmail}.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
