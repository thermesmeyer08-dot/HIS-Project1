import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";

export default async function SetupPage() {
  await connection(); // read env at request time, not build time
  if (isSupabaseConfigured()) redirect("/");
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="mb-2 text-2xl font-semibold text-brand">Almost there</h1>
      <p className="mb-4 text-muted">The CRM isn&apos;t connected to its database yet.</p>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>Create a free Supabase project (see “Supabase setup” in the README).</li>
        <li>
          Copy <code>.env.example</code> to <code>.env.local</code> and fill in <code>NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
          <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> and <code>ALLOWED_EMAILS</code>.
        </li>
        <li>Restart <code>npm run dev</code>.</li>
      </ol>
    </main>
  );
}
