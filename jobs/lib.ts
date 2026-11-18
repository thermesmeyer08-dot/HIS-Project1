/**
 * Shared setup for scheduled jobs (run by GitHub Actions or locally with tsx).
 *
 * Jobs act AS Tim: we mint a one-time sign-in token with the secret key and
 * exchange it for a normal user session. That way every query goes through the
 * same row-level security as the web app, and new rows get owner_id = Tim.
 * No email is sent by this; the session is signed out (locally) at the end.
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Usage } from "@/core/ai";

config({ path: ".env.local", quiet: true }); // local runs; in CI the env comes from secrets

export function requireEnv(...names: string[]): Record<string, string> {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  return Object.fromEntries(names.map((n) => [n, process.env[n]!]));
}

export interface JobSession {
  db: SupabaseClient;
  userId: string;
  email: string;
  close: () => Promise<void>;
}

export async function signInAsOwner(): Promise<JobSession> {
  const e = requireEnv("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "ALLOWED_EMAILS");
  const email = e.ALLOWED_EMAILS.split(",")[0].trim().toLowerCase();
  const admin = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw new Error(`Could not create job session: ${link.error.message}`);

  const db = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const v = await db.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
  if (v.error || !v.data.user) throw new Error(`Could not start job session: ${v.error?.message}`);
  return {
    db,
    userId: v.data.user.id,
    email,
    // "local" ends only this job's session, never Tim's own browser sessions.
    close: async () => void (await db.auth.signOut({ scope: "local" })),
  };
}

export interface JobRunHandle {
  id: string;
  items: number;
  usage: Usage;
  finish: (status: "ok" | "error" | "skipped", error?: string) => Promise<void>;
}

export async function startJobRun(db: SupabaseClient, job: string): Promise<JobRunHandle> {
  const { data, error } = await db.from("job_runs").insert({ job }).select("id").single();
  if (error) throw new Error(error.message);
  const handle: JobRunHandle = {
    id: data.id,
    items: 0,
    usage: { input_tokens: 0, output_tokens: 0, web_searches: 0, cost_usd: 0 },
    finish: async (status, err) => {
      await db
        .from("job_runs")
        .update({
          status,
          error: err?.slice(0, 2000) ?? null,
          items_processed: handle.items,
          input_tokens: handle.usage.input_tokens,
          output_tokens: handle.usage.output_tokens,
          web_searches: handle.usage.web_searches,
          est_cost_usd: Number(handle.usage.cost_usd.toFixed(4)),
          finished_at: new Date().toISOString(),
        })
        .eq("id", handle.id);
    },
  };
  return handle;
}

/** AI dollars already spent today (Dallas time), across all jobs. */
export async function spentToday(db: SupabaseClient): Promise<number> {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
  const startUtc = new Date(`${today}T00:00:00-06:00`).toISOString(); // close enough across DST for a budget check
  const { data } = await db.from("job_runs").select("est_cost_usd").gte("started_at", startUtc);
  return (data ?? []).reduce((n: number, r: { est_cost_usd: number }) => n + Number(r.est_cost_usd), 0);
}

export function log(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args);
}
