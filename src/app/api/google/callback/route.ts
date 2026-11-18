import { NextResponse, type NextRequest } from "next/server";
import { encryptSecret } from "@/core/crypto";
import { emailFromIdToken, exchangeCode } from "@/core/google";
import { requireUser } from "@/lib/auth";
import { env, googleRedirectUri } from "@/lib/env";

export async function GET(request: NextRequest) {
  const { supabase } = await requireUser();
  const back = (status: string) => {
    const res = NextResponse.redirect(new URL(`/settings?google=${status}`, env.siteUrl));
    res.cookies.delete("g_oauth_state");
    return res;
  };
  const sp = request.nextUrl.searchParams;
  if (sp.get("error")) return back("denied");
  const expected = request.cookies.get("g_oauth_state")?.value;
  if (!expected || sp.get("state") !== expected) return back("bad_state");
  const code = sp.get("code");
  if (!code) return back("error");

  try {
    const t = await exchangeCode({ clientId: env.googleClientId, clientSecret: env.googleClientSecret }, code, googleRedirectUri());
    if (!t.refresh_token) return back("no_refresh");
    const { error } = await supabase.from("oauth_tokens").upsert(
      {
        provider: "google",
        encrypted_refresh_token: encryptSecret(t.refresh_token, env.tokenEncryptionKey),
        scopes: t.scope.split(" "),
        account_email: emailFromIdToken(t.id_token),
      },
      { onConflict: "owner_id,provider" },
    );
    if (error) throw new Error(error.message);
    return back("connected");
  } catch (e) {
    console.error("Google connect failed:", e instanceof Error ? e.message : e);
    return back("error");
  }
}
