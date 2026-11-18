import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign-in link handler (token-hash flow). Unlike /auth/callback (PKCE), this
 * works even when the email link is opened in a different browser than the one
 * that requested it, e.g. tapping it inside the Gmail app on a phone.
 * Works with the default email template too (falls back to the PKCE code),
 * but customize the "Magic Link" template as described in the README.
 */
export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get("token_hash");
  const type = (request.nextUrl.searchParams.get("type") ?? "email") as EmailOtpType;
  const code = request.nextUrl.searchParams.get("code");
  const supabase = await createClient();
  if (token_hash) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) return NextResponse.redirect(new URL("/", request.url));
  } else if (code) {
    // Default Supabase email template (PKCE): only works in the requesting browser.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.redirect(new URL("/login?error=link", request.url));
}
