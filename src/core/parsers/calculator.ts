import { nicheFrom, normalizePhone, parseAmount, parseLabeledBlocks, splitName, type Niche } from "./shared";

/** A website needs-calculator submission (Netlify Forms notification email). */
export interface CalculatorSubmission {
  kind: "calculator";
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  path: string | null;          // "Family", "Home", "Business"
  niche: Niche | null;
  estimate: number | null;      // dollars
  estimate_text: string | null;
  term: string | null;          // "15-year term"
  details: string | null;       // breakdown line
  consent: boolean;
  raw_fields: Record<string, string>;
}

/** Recognize the notification: Netlify form email with a Path/Estimate/Email layout. */
export function isCalculatorEmail(from: string, subject: string, body: string): boolean {
  return /formresponses@netlify\.com/i.test(from) && /estimate:/i.test(body) && /email:/i.test(body);
}

export function parseCalculatorEmail(body: string): CalculatorSubmission | null {
  const f = parseLabeledBlocks(body);
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = f.get(k);
      if (v) return v;
    }
    return null;
  };
  const email = get("email", "email address")?.trim().toLowerCase() ?? null;
  if (!email || !email.includes("@")) return null;
  const name = get("name", "full name");
  const path = get("path");
  const estimateText = get("estimate", "coverage estimate");
  return {
    kind: "calculator",
    name,
    ...splitName(name),
    email,
    phone: normalizePhone(get("mobile (optional)", "mobile", "phone")),
    path,
    niche: nicheFrom(path),
    estimate: parseAmount(estimateText),
    estimate_text: estimateText,
    term: get("term"),
    details: get("details"),
    consent: /^(yes|true|on|checked|1)$/i.test(get("consent") ?? ""),
    raw_fields: Object.fromEntries(f),
  };
}
