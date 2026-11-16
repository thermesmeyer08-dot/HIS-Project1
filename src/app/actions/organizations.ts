"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizeDomain, normalizeOrgName } from "@/core/normalize";
import { normalizeState } from "@/core/texas";
import { requireUser } from "@/lib/auth";
import { type ActionState, applyDncList, fail, findOrCreateOrg, must } from "@/lib/crm";
import { str } from "@/lib/format";

function orgFields(fd: FormData) {
  const name = str(fd, "name");
  if (!name) throw new Error("Organization name is required.");
  const source = str(fd, "source");
  if (!source) throw new Error("Source is required.");
  return {
    name,
    industry: str(fd, "industry"),
    naics: str(fd, "naics"),
    city: str(fd, "city"),
    county: str(fd, "county"),
    state: normalizeState(str(fd, "state")),
    website: str(fd, "website"),
    size_estimate: str(fd, "size_estimate"),
    is_faith_based: fd.get("is_faith_based") === "on",
    source,
    source_detail: str(fd, "source_detail"),
    tx_taxpayer_id: str(fd, "tx_taxpayer_id"),
    research_summary: str(fd, "research_summary"),
  };
}

export async function createOrganization(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const { supabase } = await requireUser();
    const f = orgFields(fd);
    const res = await findOrCreateOrg(supabase, f);
    if (!res.created) return { error: "That organization already exists.", ok: `/organizations/${res.id}` };
    id = res.id;
    // Full field set (findOrCreateOrg only stores the core fields).
    must(await supabase.from("organizations").update(f).eq("id", id));
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  redirect(`/organizations/${id}`);
}

export async function updateOrganization(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const f = orgFields(fd);
    must(
      await supabase
        .from("organizations")
        .update({ ...f, name_normalized: normalizeOrgName(f.name), domain: normalizeDomain(f.website) })
        .eq("id", str(fd, "id")!),
    );
    const flagged = await applyDncList(supabase); // website may now hit a blocked domain
    revalidatePath("/", "layout");
    return { ok: flagged ? `Saved. ${flagged} contact(s) now match the do-not-contact list.` : "Saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteOrganization(fd: FormData) {
  const { supabase } = await requireUser();
  must(await supabase.from("organizations").delete().eq("id", str(fd, "id")!));
  revalidatePath("/", "layout");
  redirect("/organizations");
}
