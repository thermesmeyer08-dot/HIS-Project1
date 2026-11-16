"use server";

import { revalidatePath } from "next/cache";
import { CHANNELS, SENT_ACTIVITY_FOR_CHANNEL, type Channel, type LeadStage } from "@/core/constants";
import { withEmailFooter } from "@/core/compliance";
import { assertContactable } from "@/core/dnc";
import { isTexas } from "@/core/texas";
import type { Contact, Draft } from "@/core/types";
import { requireUser } from "@/lib/auth";
import { type ActionState, fail, getDncEntries, getSettings, logActivity, must, setLeadStage } from "@/lib/crm";
import type { Supabase } from "@/lib/supabase/server";
import { str } from "@/lib/format";

/** The full outreach gate: do-not-contact list + Texas-only for prospects. */
async function assertCanContact(supabase: Supabase, contactId: string) {
  const c = must(
    await supabase
      .from("contacts")
      .select("first_name, last_name, email, linkedin_url, do_not_contact, state, contact_type, organizations(name, website, state)")
      .eq("id", contactId)
      .single(),
  ) as unknown as Contact & { organizations: { name: string; website: string | null; state: string | null } | null };
  assertContactable(c, await getDncEntries(supabase), c.organizations?.name, c.organizations?.website);
  if (c.contact_type === "prospect" && isTexas(c.state ?? c.organizations?.state) === false) {
    throw new Error("This prospect is outside Texas. Tim is licensed in Texas only, so outreach is blocked.");
  }
}

export async function createDraft(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const contact_id = str(fd, "contact_id")!;
    const channel = str(fd, "channel") as Channel;
    if (!CHANNELS.includes(channel)) return { error: "Pick a channel." };
    let body = str(fd, "body");
    if (!body) return { error: "Write the message first." };
    await assertCanContact(supabase, contact_id);
    if (channel === "email") body = withEmailFooter(body, await getSettings(supabase));
    must(
      await supabase.from("drafts").insert({
        contact_id,
        lead_id: str(fd, "lead_id"),
        channel,
        subject: channel === "email" ? str(fd, "subject") : null,
        body,
        original_body: body,
        sequence_step: Number(str(fd, "sequence_step") ?? 0) || 0,
        model: "manual",
      }),
    );
    revalidatePath("/", "layout");
    return { ok: "Draft added to the approval queue." };
  } catch (e) {
    return fail(e);
  }
}

async function loadDraft(supabase: Supabase, id: string) {
  return must(await supabase.from("drafts").select("*").eq("id", id).single()) as Draft;
}

/** Save Tim's edits. The AI's original text is kept for learning from edits. */
export async function saveDraftEdits(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const id = str(fd, "id")!;
    const body = str(fd, "body");
    if (!body) return { error: "Message can't be empty." };
    const d = await loadDraft(supabase, id);
    if (d.status !== "pending_approval") return { error: "Only drafts awaiting approval can be edited." };
    must(
      await supabase
        .from("drafts")
        .update({
          subject: d.channel === "email" ? str(fd, "subject") : null,
          body,
          edited_body: body === d.original_body ? null : body,
        })
        .eq("id", id),
    );
    revalidatePath("/queue");
    return { ok: "Edits saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function approveDraft(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const id = str(fd, "id")!;
    const d = await loadDraft(supabase, id);
    if (d.status !== "pending_approval") return { error: "This draft is not awaiting approval." };
    await assertCanContact(supabase, d.contact_id);

    // Approving with edits in the form saves them first.
    let body = str(fd, "body") ?? d.body;
    const subject = d.channel === "email" ? (str(fd, "subject") ?? d.subject) : null;
    if (d.channel === "email") body = withEmailFooter(body, await getSettings(supabase));
    must(
      await supabase
        .from("drafts")
        .update({
          body,
          subject,
          edited_body: body === d.original_body ? d.edited_body : body,
          status: "approved",
          approved_at: new Date().toISOString(),
        })
        .eq("id", id),
    );
    revalidatePath("/", "layout");
    return {
      ok:
        d.channel === "email"
          ? "Approved. (Automatic Gmail draft creation is added in Phase 5. For now, copy it into Gmail and tap Mark sent.)"
          : "Approved. Copy it, send it yourself, then tap Mark sent.",
    };
  } catch (e) {
    return fail(e);
  }
}

export async function rejectDraft(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    must(
      await supabase
        .from("drafts")
        .update({ status: "rejected", rejection_reason: str(fd, "rejection_reason") })
        .eq("id", str(fd, "id")!),
    );
    revalidatePath("/", "layout");
    return { ok: "Rejected. The reason will guide future drafts." };
  } catch (e) {
    return fail(e);
  }
}

const PRE_CONTACT: LeadStage[] = ["new", "researched", "drafted"];

export async function markSent(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const d = await loadDraft(supabase, str(fd, "id")!);
    if (d.status !== "approved") return { error: "Approve the draft before marking it sent." };
    await assertCanContact(supabase, d.contact_id);
    const now = new Date().toISOString();
    must(await supabase.from("drafts").update({ status: "sent", sent_at: now }).eq("id", d.id));
    await logActivity(supabase, {
      contact_id: d.contact_id,
      lead_id: d.lead_id,
      type: SENT_ACTIVITY_FOR_CHANNEL[d.channel],
      body: d.subject ? `${d.subject}\n\n${d.body}` : d.body,
      metadata: { draft_id: d.id, channel: d.channel, sequence_step: d.sequence_step },
    });
    if (d.lead_id) {
      const lead = must(await supabase.from("leads").select("stage").eq("id", d.lead_id).single()) as { stage: LeadStage };
      if (PRE_CONTACT.includes(lead.stage)) await setLeadStage(supabase, d.lead_id, "contacted");
    }
    revalidatePath("/", "layout");
    return { ok: "Marked sent and logged on the timeline." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteDraft(fd: FormData) {
  const { supabase } = await requireUser();
  must(await supabase.from("drafts").delete().eq("id", str(fd, "id")!));
  revalidatePath("/", "layout");
}
