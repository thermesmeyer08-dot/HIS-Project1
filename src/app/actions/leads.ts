"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { LEAD_STAGES, MANUAL_ACTIVITY_TYPES, PRODUCTS, type ActivityType, type LeadStage } from "@/core/constants";
import { requireUser } from "@/lib/auth";
import { type ActionState, fail, logActivity, must, setLeadStage } from "@/lib/crm";
import { str } from "@/lib/format";

export async function createLeadForContact(fd: FormData) {
  const { supabase } = await requireUser();
  const contactId = str(fd, "contact_id")!;
  const contact = must(await supabase.from("contacts").select("org_id").eq("id", contactId).single()) as {
    org_id: string | null;
  };
  const lead = must(
    await supabase
      .from("leads")
      .insert({ contact_id: contactId, org_id: contact.org_id, niche: str(fd, "niche") ?? "business_owner" })
      .select("id")
      .single(),
  ) as { id: string };
  revalidatePath("/", "layout");
  redirect(`/leads/${lead.id}`);
}

export async function updateLead(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const id = str(fd, "id")!;
    const scoreRaw = str(fd, "score");
    const score = scoreRaw === null ? null : Math.max(0, Math.min(100, Math.round(Number(scoreRaw))));
    if (scoreRaw !== null && Number.isNaN(score)) return { error: "Score must be a number from 0 to 100." };
    const products = fd.getAll("product_interest").map(String).filter((p) => (PRODUCTS as readonly string[]).includes(p));
    must(
      await supabase
        .from("leads")
        .update({
          niche: str(fd, "niche") ?? "business_owner",
          score,
          score_reasoning: str(fd, "score_reasoning"),
          product_interest: products,
          next_action: str(fd, "next_action"),
          next_action_date: str(fd, "next_action_date"),
          owner_notes: str(fd, "owner_notes"),
          call_prep_brief: str(fd, "call_prep_brief"),
        })
        .eq("id", id),
    );
    const stage = str(fd, "stage");
    if (stage && (LEAD_STAGES as readonly string[]).includes(stage)) await setLeadStage(supabase, id, stage as LeadStage);
    revalidatePath("/", "layout");
    return { ok: "Lead saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function changeStage(fd: FormData) {
  const { supabase } = await requireUser();
  const stage = str(fd, "stage");
  if (stage && (LEAD_STAGES as readonly string[]).includes(stage)) {
    await setLeadStage(supabase, str(fd, "id")!, stage as LeadStage);
  }
  revalidatePath("/", "layout");
}

export async function completeTask(fd: FormData) {
  const { supabase } = await requireUser();
  const id = str(fd, "id")!;
  const lead = must(await supabase.from("leads").select("contact_id, next_action").eq("id", id).single()) as {
    contact_id: string;
    next_action: string | null;
  };
  must(await supabase.from("leads").update({ next_action: null, next_action_date: null }).eq("id", id));
  await logActivity(supabase, { contact_id: lead.contact_id, lead_id: id, type: "note", body: `Done: ${lead.next_action ?? "task"}` });
  revalidatePath("/", "layout");
}

export async function addActivity(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const type = str(fd, "type") as ActivityType;
    if (!MANUAL_ACTIVITY_TYPES.includes(type)) return { error: "Pick an activity type." };
    const body = str(fd, "body");
    if (!body) return { error: "Add a short note." };
    const when = str(fd, "occurred_at");
    await logActivity(supabase, {
      contact_id: str(fd, "contact_id"),
      lead_id: str(fd, "lead_id"),
      type,
      body,
      occurred_at: when ? new Date(when).toISOString() : undefined,
    });
    revalidatePath("/", "layout");
    return { ok: "Logged." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteLead(fd: FormData) {
  const { supabase } = await requireUser();
  must(await supabase.from("leads").delete().eq("id", str(fd, "id")!));
  revalidatePath("/", "layout");
  redirect("/leads");
}

/** Clear the brief so the next scheduled run writes a fresh one. */
export async function requestBriefRebuild(fd: FormData) {
  const { supabase } = await requireUser();
  const id = str(fd, "id")!;
  must(await supabase.from("leads").update({ call_prep_brief: null }).eq("id", id));
  revalidatePath(`/leads/${id}`);
}
