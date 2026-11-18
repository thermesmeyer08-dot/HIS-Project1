"use server";

import { revalidatePath } from "next/cache";
import { CHANNELS, type Channel } from "@/core/constants";
import { normalizeDncValue, type DncKind } from "@/core/dnc";
import { requireUser } from "@/lib/auth";
import { type ActionState, applyDncList, fail, getSettings, must } from "@/lib/crm";
import { str } from "@/lib/format";

const list = (v: string | null) =>
  (v ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

export async function saveSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const current = await getSettings(supabase);
    const num = (k: string, fallback: number) => {
      const n = Number(str(fd, k));
      return Number.isFinite(n) && str(fd, k) !== null ? n : fallback;
    };
    const followups = list(str(fd, "followup_days")).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    const booking = str(fd, "booking_url");
    if (booking && !/^https:\/\//.test(booking)) return { error: "Booking link must start with https://" };
    must(
      await supabase
        .from("settings")
        .update({
          daily_prospect_cap: Math.max(0, Math.min(200, Math.round(num("daily_prospect_cap", current.daily_prospect_cap)))),
          daily_cost_cap_usd: Math.max(0, num("daily_cost_cap_usd", current.daily_cost_cap_usd)),
          max_searches_per_prospect: Math.max(0, Math.round(num("max_searches_per_prospect", current.max_searches_per_prospect))),
          research_model: str(fd, "research_model") ?? current.research_model,
          fast_model: str(fd, "fast_model") ?? current.fast_model,
          email_signature: str(fd, "email_signature") ?? current.email_signature,
          footer_address: str(fd, "footer_address"),
          booking_url: booking ?? current.booking_url,
          website_url: str(fd, "website_url") ?? current.website_url,
          target_counties: list(str(fd, "target_counties")),
          target_industries: list(str(fd, "target_industries")),
          followup_days: followups.length ? followups : current.followup_days,
          style_example_count: Math.max(0, Math.round(num("style_example_count", current.style_example_count))),
        })
        .eq("id", current.id),
    );
    revalidatePath("/settings");
    return { ok: "Settings saved." };
  } catch (e) {
    return fail(e);
  }
}

const DNC_KINDS: DncKind[] = ["email", "domain", "linkedin", "name_org"];

export async function addDnc(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const kind = str(fd, "kind") as DncKind;
    if (!DNC_KINDS.includes(kind)) return { error: "Pick a type." };
    const value = normalizeDncValue(kind, str(fd, "value") ?? "");
    if (!value) {
      return {
        error:
          kind === "name_org"
            ? "Use the format: First Last | Business Name"
            : `That doesn't look like a valid ${kind === "linkedin" ? "LinkedIn profile URL" : kind}.`,
      };
    }
    const res = await supabase.from("do_not_contact").insert({ kind, value_normalized: value, reason: str(fd, "reason") });
    if (res.error && !res.error.message.includes("duplicate")) throw new Error(res.error.message);
    const flagged = await applyDncList(supabase);
    revalidatePath("/", "layout");
    return { ok: `Added ${value}.${flagged ? ` ${flagged} existing contact(s) blocked and their drafts pulled.` : ""}` };
  } catch (e) {
    return fail(e);
  }
}

export async function removeDnc(fd: FormData) {
  const { supabase } = await requireUser();
  must(await supabase.from("do_not_contact").delete().eq("id", str(fd, "id")!));
  revalidatePath("/settings");
}

export async function saveTemplate(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const id = str(fd, "id");
    const channel = str(fd, "channel") as Channel;
    if (!CHANNELS.includes(channel)) return { error: "Pick a channel." };
    const name = str(fd, "name");
    const body = str(fd, "body");
    if (!name || !body) return { error: "Name and body are required." };
    const status = (str(fd, "compliance_status") ?? "draft") as "draft" | "submitted" | "approved";
    const existing = id
      ? (must(await supabase.from("templates").select("compliance_status, body, subject").eq("id", id).single()) as {
          compliance_status: string;
          body: string;
          subject: string | null;
        })
      : null;
    // Editing an approved template's wording sends it back to draft for re-approval.
    const wordingChanged = existing && (existing.body !== body || (existing.subject ?? null) !== str(fd, "subject"));
    const finalStatus = existing?.compliance_status === "approved" && wordingChanged && status === "approved" ? "draft" : status;
    const now = new Date().toISOString();
    const row = {
      name,
      channel,
      subject: str(fd, "subject"),
      body,
      notes: str(fd, "notes"),
      compliance_status: finalStatus,
      ...(finalStatus === "submitted" && existing?.compliance_status !== "submitted" ? { submitted_at: now } : {}),
      ...(finalStatus === "approved" && existing?.compliance_status !== "approved" ? { approved_at: now } : {}),
    };
    if (id) must(await supabase.from("templates").update(row).eq("id", id));
    else must(await supabase.from("templates").insert(row));
    revalidatePath("/settings");
    return {
      ok: finalStatus !== status ? "Saved. Wording changed, so it's back to draft and needs re-approval." : "Template saved.",
    };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTemplate(fd: FormData) {
  const { supabase } = await requireUser();
  must(await supabase.from("templates").delete().eq("id", str(fd, "id")!));
  revalidatePath("/settings");
}

export async function signOut() {
  const { supabase } = await requireUser();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
}

export async function disconnectGoogle() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("oauth_tokens").select("encrypted_refresh_token").eq("provider", "google").maybeSingle();
  if (data?.encrypted_refresh_token && process.env.TOKEN_ENCRYPTION_KEY) {
    try {
      const { decryptSecret } = await import("@/core/crypto");
      const token = decryptSecret(data.encrypted_refresh_token, process.env.TOKEN_ENCRYPTION_KEY);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" });
    } catch {
      // Revocation is best-effort; we still delete our copy.
    }
  }
  must(await supabase.from("oauth_tokens").delete().eq("provider", "google"));
  revalidatePath("/settings");
}

export async function saveInboundSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const current = await getSettings(supabase);
    const int = (k: string, lo: number, hi: number, fallback: number) => {
      const n = Math.round(Number(str(fd, k)));
      return Number.isFinite(n) && str(fd, k) !== null ? Math.max(lo, Math.min(hi, n)) : fallback;
    };
    must(
      await supabase
        .from("settings")
        .update({
          inbound_gmail_query: str(fd, "inbound_gmail_query") ?? current.inbound_gmail_query,
          booking_title_match: str(fd, "booking_title_match") ?? current.booking_title_match,
          followup_delay_hours: int("followup_delay_hours", 0, 720, current.followup_delay_hours),
          inbound_lookback_days: int("inbound_lookback_days", 1, 365, current.inbound_lookback_days),
          brief_days_ahead: int("brief_days_ahead", 0, 30, current.brief_days_ahead),
        })
        .eq("id", current.id),
    );
    revalidatePath("/settings");
    return { ok: "Inbound settings saved." };
  } catch (e) {
    return fail(e);
  }
}
