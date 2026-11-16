export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  /** Comma-separated list of emails allowed to sign in (just Tim). */
  allowedEmails: (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

export const isSupabaseConfigured = () => Boolean(env.supabaseUrl && env.supabasePublishableKey);

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  // If no allow-list is configured we refuse everyone rather than allow everyone.
  return env.allowedEmails.includes(email.toLowerCase());
}
