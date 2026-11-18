/**
 * Minimal Google OAuth + Gmail + Calendar client over fetch.
 * Scopes are deliberately narrow: read Gmail, create drafts, read Calendar.
 * There is intentionally NO function here that sends email.
 */

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose", // drafts (Phase 5); the app never sends
  "https://www.googleapis.com/auth/calendar.readonly",
];

export interface GoogleClientConfig {
  clientId: string;
  clientSecret: string;
}

export function googleAuthUrl(cfg: GoogleClientConfig, redirectUri: string, state: string, loginHint?: string) {
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // always return a refresh token
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = await res.json();
  if (!res.ok) {
    const hint = json.error === "invalid_grant" ? " (Google access was revoked or expired. Reconnect Google in Settings.)" : "";
    throw new Error(`Google token error: ${json.error_description ?? json.error ?? res.status}${hint}`);
  }
  return json as TokenResponse;
}

export function exchangeCode(cfg: GoogleClientConfig, code: string, redirectUri: string) {
  return tokenRequest({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
}

export async function refreshAccessToken(cfg: GoogleClientConfig, refreshToken: string): Promise<string> {
  const t = await tokenRequest({
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
  });
  return t.access_token;
}

/** Email address inside an OpenID id_token (no signature check needed: it came straight from Google over TLS). */
export function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

async function gget<T>(token: string, url: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google API ${res.status} for ${new URL(url).pathname}: ${await res.text()}`);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------- Gmail

export interface GmailMessage {
  id: string;
  threadId: string;
  internalDate: string;
  from: string;
  subject: string;
  date: string;
  text: string;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
}

function decodePart(data?: string) {
  return data ? Buffer.from(data, "base64url").toString("utf8") : "";
}

/** Prefer text/plain; fall back to stripped text/html. */
export function extractText(part: GmailPart): string {
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (p: GmailPart) => {
    if (p.mimeType === "text/plain") plain.push(decodePart(p.body?.data));
    else if (p.mimeType === "text/html") html.push(decodePart(p.body?.data));
    p.parts?.forEach(walk);
  };
  walk(part);
  if (plain.length) return plain.join("\n");
  return html
    .join("\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'");
}

export async function gmailSearch(token: string, q: string, max = 50): Promise<{ id: string; threadId: string }[]> {
  const out: { id: string; threadId: string }[] = [];
  let pageToken: string | undefined;
  do {
    const u = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    u.searchParams.set("q", q);
    u.searchParams.set("maxResults", String(Math.min(100, max)));
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const r = await gget<{ messages?: { id: string; threadId: string }[]; nextPageToken?: string }>(token, u.toString());
    out.push(...(r.messages ?? []));
    pageToken = r.nextPageToken;
  } while (pageToken && out.length < max);
  return out.slice(0, max);
}

export async function gmailGet(token: string, id: string): Promise<GmailMessage> {
  const m = await gget<{ id: string; threadId: string; internalDate: string; payload: GmailPart }>(
    token,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
  );
  const h = (n: string) => m.payload.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? "";
  return { id: m.id, threadId: m.threadId, internalDate: m.internalDate, from: h("from"), subject: h("subject"), date: h("date"), text: extractText(m.payload) };
}

// ---------------------------------------------------------------- Calendar

export interface CalendarEvent {
  id: string;
  status: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  htmlLink?: string;
  updated?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email: string; responseStatus?: string; organizer?: boolean; self?: boolean }[];
  hangoutLink?: string;
}

export async function calendarEvents(token: string, timeMin: Date, timeMax: Date): Promise<CalendarEvent[]> {
  const out: CalendarEvent[] = [];
  let pageToken: string | undefined;
  do {
    const u = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    u.searchParams.set("timeMin", timeMin.toISOString());
    u.searchParams.set("timeMax", timeMax.toISOString());
    u.searchParams.set("singleEvents", "true");
    u.searchParams.set("showDeleted", "true"); // so cancellations are seen
    u.searchParams.set("orderBy", "startTime");
    u.searchParams.set("maxResults", "250");
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const r = await gget<{ items?: CalendarEvent[]; nextPageToken?: string }>(token, u.toString());
    out.push(...(r.items ?? []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return out;
}
