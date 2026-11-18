"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CONTACT_TYPES, PROFESSIONS, PARTNER_STAGES, type ContactType } from "@/core/constants";
import { findDncMatch } from "@/core/dnc";
import { requireUser } from "@/lib/auth";
import {
  type ActionState,
  blockContact,
  contactFields,
  fail,
  findOrCreateOrg,
  getDncEntries,
  logActivity,
  must,
  upsertContact,
} from "@/lib/crm";
import { str } from "@/lib/format";

function contactType(fd: FormData): ContactType {
  const t = str(fd, "contact_type");
  return (CONTACT_TYPES as readonly string[]).includes(t ?? "") ? (t as ContactType) : "prospect";
}

/** Resolve the org for a contact form: existing org_id, or create from org_name/org_website. */
async function resolveOrg(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], fd: FormData, source: string) {
  const orgId = str(fd, "org_id");
  if (orgId) {
    const org = must(await supabase.from("organizations").select("id, name, website").eq("id", orgId).single()) as {
      id: string;
      name: string;
      website: string | null;
    };
    return org;
  }
  const name = str(fd, "org_name");
  if (!name) return null;
  const website = str(fd, "org_website");
  const { id } = await findOrCreateOrg(supabase, {
    name,
    website,
    industry: str(fd, "org_industry"),
    city: str(fd, "org_city") ?? str(fd, "city"),
    state: str(fd, "org_state") ?? str(fd, "state"),
    source,
  });
  return { id, name, website };
}

export async function createContact(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  let dest: string;
  try {
    const { supabase } = await requireUser();
    const source = str(fd, "source");
    const consent_note = str(fd, "consent_note");
    if (!source || !consent_note) return { error: "Source and “how we got this contact” are required." };
    const type = contactType(fd);
    const org = await resolveOrg(supabase, fd, source);

    const res = await upsertContact(
      supabase,
      {
        first_name: str(fd, "first_name"),
        last_name: str(fd, "last_name"),
        title: str(fd, "title"),
        email: str(fd, "email"),
        email_source: str(fd, "email_source"),
        linkedin_url: str(fd, "linkedin_url"),
        phone: str(fd, "phone"),
        city: str(fd, "city"),
        state: str(fd, "state"),
        contact_type: type,
        source,
        consent_note,
        org_id: org?.id ?? null,
      },
      { orgName: org?.name, orgWebsite: org?.website },
    );
    if (!res.created) {
      return { error: `This person already exists (matched on ${res.duplicateReason}).`, ok: `/contacts/${res.id}` };
    }
    id = res.id;
    dest = `/contacts/${id}`;

    if (type === "referral_partner") {
      must(
        await supabase.from("referral_partners").insert({
          contact_id: id,
          profession: (PROFESSIONS as readonly string[]).includes(str(fd, "profession") ?? "") ? str(fd, "profession") : "other",
        }),
      );
    }
    if (fd.get("create_lead") === "on") {
      const lead = must(
        await supabase
          .from("leads")
          .insert({ contact_id: id, org_id: org?.id ?? null, niche: str(fd, "niche") ?? "business_owner" })
          .select("id")
          .single(),
      ) as { id: string };
      dest = `/leads/${lead.id}`;
    }
    await logActivity(supabase, { contact_id: id, type: "note", body: `Contact added manually. Source: ${source}` });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  redirect(dest);
}

export async function updateContact(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const id = str(fd, "id")!;
    const source = str(fd, "source");
    const consent_note = str(fd, "consent_note");
    if (!source || !consent_note) return { error: "Source and “how we got this contact” are required." };
    const type = contactType(fd);
    const org = await resolveOrg(supabase, fd, source);
    const fields = contactFields({
      first_name: str(fd, "first_name"),
      last_name: str(fd, "last_name"),
      title: str(fd, "title"),
      email: str(fd, "email"),
      email_source: str(fd, "email_source"),
      linkedin_url: str(fd, "linkedin_url"),
      phone: str(fd, "phone"),
      city: str(fd, "city"),
      state: str(fd, "state"),
      contact_type: type,
      source,
      consent_note,
      org_id: org?.id ?? null,
    });
    must(await supabase.from("contacts").update(fields).eq("id", id));

    if (type === "referral_partner") {
      await supabase.from("referral_partners").upsert({ contact_id: id }, { onConflict: "contact_id", ignoreDuplicates: true });
    }

    // Edits can create a new DNC match (e.g. a new email on a blocked domain).
    const dnc = await getDncEntries(supabase);
    const hit = findDncMatch(fields, dnc, org?.name, org?.website);
    const current = must(await supabase.from("contacts").select("do_not_contact").eq("id", id).single()) as {
      do_not_contact: boolean;
    };
    if (hit && !current.do_not_contact) {
      await blockContact(supabase, id, `Matched DNC list (${hit.kind}: ${hit.value_normalized})`);
    }
    revalidatePath("/", "layout");
    return { ok: hit ? "Saved. This contact matches the do-not-contact list and is now blocked." : "Saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function setDoNotContact(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const id = str(fd, "id")!;
    const on = str(fd, "on") === "true";
    if (on) {
      await blockContact(supabase, id, str(fd, "reason") ?? "Marked do-not-contact by Tim");
    } else {
      must(await supabase.from("contacts").update({ do_not_contact: false, dnc_reason: null }).eq("id", id));
      await logActivity(supabase, { contact_id: id, type: "dnc", body: "Removed from do-not-contact" });
    }
    revalidatePath("/", "layout");
    return { ok: on ? "Marked do-not-contact. Pending drafts were pulled from the queue." : "Do-not-contact removed." };
  } catch (e) {
    return fail(e);
  }
}

export async function updatePartner(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const contact_id = str(fd, "contact_id")!;
    const profession = str(fd, "profession");
    const stage = str(fd, "relationship_stage");
    must(
      await supabase.from("referral_partners").upsert(
        {
          contact_id,
          profession: (PROFESSIONS as readonly string[]).includes(profession ?? "") ? profession : "other",
          relationship_stage: (PARTNER_STAGES as readonly string[]).includes(stage ?? "") ? stage : "identified",
          referrals_given: Number(str(fd, "referrals_given") ?? 0) || 0,
          referrals_received: Number(str(fd, "referrals_received") ?? 0) || 0,
          notes: str(fd, "notes"),
        },
        { onConflict: "contact_id" },
      ),
    );
    revalidatePath("/", "layout");
    return { ok: "Partner details saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteContact(fd: FormData) {
  const { supabase } = await requireUser();
  must(await supabase.from("contacts").delete().eq("id", str(fd, "id")!));
  revalidatePath("/", "layout");
  redirect("/contacts");
}
