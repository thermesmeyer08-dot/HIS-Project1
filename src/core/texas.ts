/**
 * Texas-only rule. Returns true for Texas, false for a known non-Texas state,
 * and null when the location is unknown (flag for review, don't drop silently).
 */
export function isTexas(state: string | null | undefined): boolean | null {
  const s = (state ?? "").trim().toLowerCase().replace(/\./g, "");
  if (!s) return null;
  return s === "tx" || s === "texas";
}

export function normalizeState(state: string | null | undefined): string | null {
  const s = (state ?? "").trim();
  if (!s) return null;
  return isTexas(s) ? "TX" : s.length === 2 ? s.toUpperCase() : s;
}
