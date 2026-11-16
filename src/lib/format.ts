export function fullName(c: { first_name?: string | null; last_name?: string | null } | null | undefined): string {
  const n = `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim();
  return n || "(no name)";
}

const TZ = "America/Chicago";

/** Today's date in Dallas as YYYY-MM-DD. */
export function todayCentral(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = value.length === 10 ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: value.length === 10 ? "UTC" : TZ });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  });
}

export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 864e5).toISOString();
}

/** Read a trimmed string from FormData; empty becomes null. */
export function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}
