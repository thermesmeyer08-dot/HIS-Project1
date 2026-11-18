/** Helpers shared by the inbound parsers. */

export type Niche = "family" | "home" | "business_owner" | "other";

/** "Family" / "Bussiness " / "my business" -> niche. */
export function nicheFrom(text: string | null | undefined): Niche | null {
  const t = (text ?? "").toLowerCase();
  if (!t.trim()) return null;
  if (/bus+i?n?e?s+/.test(t) || t.includes("company") || t.includes("owner")) return "business_owner";
  if (t.includes("home") || t.includes("mortgage") || t.includes("house")) return "home";
  if (t.includes("famil") || t.includes("kids") || t.includes("spouse") || t.includes("wife") || t.includes("husband")) return "family";
  return "other";
}

/** "$1,500,000" -> 1500000; "7 million" -> 7000000; "750k" -> 750000; "1.5M" -> 1500000. */
export function parseAmount(text: string | null | undefined): number | null {
  const t = (text ?? "").toLowerCase().replace(/,/g, "").trim();
  const m = t.match(/(\d+(?:\.\d+)?)\s*(million|mil|mm|m|thousand|k|billion|b)?\b/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] ?? "";
  const mult = /^(million|mil|mm|m)$/.test(unit) ? 1e6 : /^(thousand|k)$/.test(unit) ? 1e3 : /^(billion|b)$/.test(unit) ? 1e9 : 1;
  const value = Math.round(n * mult);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Keep digits; return 10-digit US numbers formatted, else the cleaned input. */
export function normalizePhone(text: string | null | undefined): string | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw;
}

export function splitName(full: string | null | undefined): { first_name: string | null; last_name: string | null } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: null, last_name: null };
  if (parts.length === 1) return { first_name: parts[0], last_name: null };
  return { first_name: parts.slice(0, -1).join(" "), last_name: parts[parts.length - 1] };
}

/**
 * Parse Netlify Forms' "Label:\nValue\n\nLabel:\nValue" layout into a map keyed
 * by lower-cased label. Only a line that is *just* "Label:" starts a field, so
 * values that contain colons ("Mortgage payoff: $280,000") stay intact.
 */
export function parseLabeledBlocks(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let key: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (key) out.set(key, buf.join("\n").trim());
    key = null;
    buf = [];
  };
  for (const line of lines) {
    const label = line.match(/^\s*([A-Za-z][A-Za-z0-9 ()/'-]{0,60}):\s*$/);
    if (label) {
      flush();
      key = label[1].trim().toLowerCase();
    } else if (key) {
      buf.push(line);
    }
  }
  flush();
  return out;
}
