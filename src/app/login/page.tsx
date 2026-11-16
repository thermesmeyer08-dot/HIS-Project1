import { redirect } from "next/navigation";
import { env, isAllowedEmail, isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { btn } from "@/components/ui";

async function sendLink(fd: FormData) {
  "use server";
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  // Same response whether or not the address is allowed, so the page doesn't reveal who can sign in.
  if (isAllowedEmail(email)) {
    const supabase = await createClient();
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${env.siteUrl}/auth/callback`, shouldCreateUser: false },
    });
  }
  redirect("/login?sent=1");
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams; // also makes this page render per request
  if (!isSupabaseConfigured()) redirect("/setup");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold text-brand">Hermesmeyer Insurance Solutions</h1>
      <p className="mb-6 text-sm text-muted">CRM sign-in</p>
      {sp.sent ? (
        <p className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          If that address is allowed, a sign-in link is on its way. Open it on this device.
        </p>
      ) : (
        <form action={sendLink} className="space-y-3">
          {sp.error === "not_allowed" && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">That account isn&apos;t allowed to use this CRM.</p>
          )}
          {sp.error === "link" && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">That sign-in link expired or was already used. Request a new one.</p>
          )}
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@hermesmeyerinsurance.com"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2"
          />
          <button className={`${btn.primary} w-full`}>Email me a sign-in link</button>
        </form>
      )}
    </main>
  );
}
