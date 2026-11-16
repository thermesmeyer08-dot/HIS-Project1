import {
  emailDomain,
  nameOrgKey,
  normalizeDomain,
  normalizeEmail,
  normalizeLinkedIn,
  normalizeOrgName,
  normalizePersonName,
} from "./normalize";

export type DncKind = "email" | "domain" | "linkedin" | "name_org";
export interface DncEntry {
  kind: DncKind;
  value_normalized: string;
  reason?: string | null;
}

export interface ContactLike {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
  do_not_contact?: boolean | null;
}

/** Turn raw user input for a DNC entry into its stored normalized form. */
export function normalizeDncValue(kind: DncKind, raw: string): string | null {
  switch (kind) {
    case "email":
      return normalizeEmail(raw);
    case "domain":
      return normalizeDomain(raw);
    case "linkedin":
      return normalizeLinkedIn(raw);
    case "name_org": {
      // Accept "First Last | Org Name"
      const [person, org] = raw.split("|");
      if (!person || !org) return null;
      const name = normalizePersonName(person, "");
      return nameOrgKey(name, org);
    }
  }
}

/** The keys a contact can be matched on. */
export function dncKeysFor(contact: ContactLike, orgName?: string | null): DncEntry[] {
  const keys: DncEntry[] = [];
  const email = normalizeEmail(contact.email);
  if (email) keys.push({ kind: "email", value_normalized: email });
  const domain = emailDomain(contact.email);
  if (domain) keys.push({ kind: "domain", value_normalized: domain });
  const li = normalizeLinkedIn(contact.linkedin_url);
  if (li) keys.push({ kind: "linkedin", value_normalized: li });
  const no = nameOrgKey(normalizePersonName(contact.first_name, contact.last_name), orgName);
  if (no) keys.push({ kind: "name_org", value_normalized: no });
  return keys;
}

/** Returns the matching DNC entry (or a synthetic one for the contact flag), else null. */
export function findDncMatch(
  contact: ContactLike,
  entries: DncEntry[],
  orgName?: string | null,
  orgWebsite?: string | null,
): DncEntry | null {
  if (contact.do_not_contact) {
    return { kind: "email", value_normalized: "(contact flagged do-not-contact)", reason: "Contact flag" };
  }
  const keys = dncKeysFor(contact, orgName);
  const orgDomain = normalizeDomain(orgWebsite);
  if (orgDomain) keys.push({ kind: "domain", value_normalized: orgDomain });
  const set = new Map(entries.map((e) => [`${e.kind}:${e.value_normalized}`, e]));
  for (const k of keys) {
    const hit = set.get(`${k.kind}:${k.value_normalized}`);
    if (hit) return hit;
  }
  return null;
}

export class DoNotContactError extends Error {
  constructor(public match: DncEntry) {
    super(`Blocked by do-not-contact list (${match.kind}: ${match.value_normalized})`);
    this.name = "DoNotContactError";
  }
}

/** Throw if this contact must not be contacted. Call before creating or approving any draft. */
export function assertContactable(
  contact: ContactLike,
  entries: DncEntry[],
  orgName?: string | null,
  orgWebsite?: string | null,
): void {
  const match = findDncMatch(contact, entries, orgName, orgWebsite);
  if (match) throw new DoNotContactError(match);
}

export { normalizeOrgName };
