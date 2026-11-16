import {
  normalizeDomain,
  normalizeEmail,
  normalizeLinkedIn,
  normalizeOrgName,
  normalizePersonName,
} from "./normalize";

export interface ContactCandidate {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
  org_name?: string | null;
}

export interface OrgCandidate {
  id?: string;
  name: string;
  website?: string | null;
  domain?: string | null;
  city?: string | null;
}

export type DuplicateReason = "email" | "linkedin" | "name_org" | "domain" | "name_city";

export interface DuplicateMatch<T> {
  record: T;
  reason: DuplicateReason;
}

/**
 * Find an existing contact that is the same person. Strongest signal wins:
 * email, then LinkedIn URL, then normalized name + organization.
 */
export function findDuplicateContact<T extends ContactCandidate>(
  candidate: ContactCandidate,
  existing: T[],
): DuplicateMatch<T> | null {
  const email = normalizeEmail(candidate.email);
  const li = normalizeLinkedIn(candidate.linkedin_url);
  const name = normalizePersonName(candidate.first_name, candidate.last_name);
  const org = normalizeOrgName(candidate.org_name);

  if (email) {
    const hit = existing.find((e) => normalizeEmail(e.email) === email);
    if (hit) return { record: hit, reason: "email" };
  }
  if (li) {
    const hit = existing.find((e) => normalizeLinkedIn(e.linkedin_url) === li);
    if (hit) return { record: hit, reason: "linkedin" };
  }
  if (name && org) {
    const hit = existing.find(
      (e) =>
        normalizePersonName(e.first_name, e.last_name) === name && normalizeOrgName(e.org_name) === org,
    );
    if (hit) return { record: hit, reason: "name_org" };
  }
  return null;
}

/** Same business: website domain, else normalized name in the same city. */
export function findDuplicateOrg<T extends OrgCandidate>(
  candidate: OrgCandidate,
  existing: T[],
): DuplicateMatch<T> | null {
  const domain = normalizeDomain(candidate.domain || candidate.website);
  if (domain) {
    const hit = existing.find((e) => normalizeDomain(e.domain || e.website) === domain);
    if (hit) return { record: hit, reason: "domain" };
  }
  const name = normalizeOrgName(candidate.name);
  const city = (candidate.city ?? "").trim().toLowerCase();
  if (name) {
    const hit = existing.find(
      (e) => normalizeOrgName(e.name) === name && (e.city ?? "").trim().toLowerCase() === city,
    );
    if (hit) return { record: hit, reason: "name_city" };
  }
  return null;
}
