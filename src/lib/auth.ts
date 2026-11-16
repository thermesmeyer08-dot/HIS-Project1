import "server-only";
import { redirect } from "next/navigation";
import { isAllowedEmail } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/** Use at the top of every page and server action. Returns an RLS-scoped client. */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const email = (claims?.email as string | undefined) ?? null;
  if (!claims?.sub || !isAllowedEmail(email)) redirect("/login");
  return { supabase, userId: claims.sub as string, email: email! };
}
