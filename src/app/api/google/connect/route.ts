import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { googleAuthUrl } from "@/core/google";
import { requireUser } from "@/lib/auth";
import { env, googleRedirectUri, isGoogleConfigured } from "@/lib/env";

/** Start the Google consent flow (Gmail read + drafts, Calendar read). */
export async function GET() {
  const { email } = await requireUser();
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL("/settings?google=not_configured", env.siteUrl));
  }
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(
    googleAuthUrl({ clientId: env.googleClientId, clientSecret: env.googleClientSecret }, googleRedirectUri(), state, email),
  );
  res.cookies.set("g_oauth_state", state, { httpOnly: true, secure: env.siteUrl.startsWith("https"), sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
