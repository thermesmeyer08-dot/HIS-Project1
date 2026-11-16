/** Normalization helpers shared by dedupe, do-not-contact matching and imports. */

export function normalizeEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return e.includes("@") ? e : null;
}

export function emailDomain(email: string | null | undefined): string | null {
  const e = normalizeEmail(email);
  return e ? e.split("@")[1] || null : null;
}

/** "https://www.Acme.com/about" -> "acme.com". Also accepts bare domains. */
export function normalizeDomain(input: string | null | undefined): string | null {
  let s = (input ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s.includes("@")) s = s.split("@")[1];
  s = s.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "");
  s = s.split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/\.$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) ? s : null;
}

/** "https://www.linkedin.com/in/Jane-Doe/?utm=x" -> "linkedin.com/in/jane-doe" */
export function normalizeLinkedIn(url: string | null | undefined): string | null {
  const s = (url ?? "").trim().toLowerCase();
  const m = s.match(/linkedin\.com\/(in|company)\/([^/?#]+)/);
  return m ? `linkedin.com/${m[1]}/${decodeURIComponent(m[2])}` : null;
}

function basic(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NAME_NOISE = new Set(["mr", "mrs", "ms", "dr", "jr", "sr", "ii", "iii", "iv", "cpa", "esq", "cfp"]);

export function normalizePersonName(first?: string | null, last?: string | null): string {
  return basic(`${first ?? ""} ${last ?? ""}`)
    .split(" ")
    .filter((w) => w && !NAME_NOISE.has(w))
    .join(" ");
}

const ORG_SUFFIXES = new Set([
  "llc", "l l c", "inc", "incorporated", "co", "corp", "corporation", "company", "ltd", "limited",
  "pllc", "pc", "lp", "llp", "lllp", "the", "group", "dba",
]);

/** "The Acme Plumbing Co., LLC" -> "acme plumbing" */
export function normalizeOrgName(name: string | null | undefined): string {
  const words = basic(name ?? "").split(" ").filter(Boolean);
  // Strip leading "the" and trailing legal suffixes (possibly several).
  while (words.length > 1 && words[0] === "the") words.shift();
  while (words.length > 1 && ORG_SUFFIXES.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}

export function nameOrgKey(personName: string, orgName: string | null | undefined): string | null {
  const org = normalizeOrgName(orgName);
  return personName && org ? `${personName}|${org}` : null;
}
