export const ADDRESS_PLACEHOLDER = "[ADDRESS NEEDED]";
export const OPT_OUT_LINE = 'If you\'d rather not hear from me, just reply "unsubscribe" and I won\'t reach out again.';

export interface FooterSettings {
  email_signature: string;
  booking_url: string;
  footer_address: string | null;
}

/**
 * Every outbound email ends with: booking link, signature, opt-out line,
 * and business postal address (CAN-SPAM). No phone number, by design.
 */
export function buildEmailFooter(s: FooterSettings): string {
  return [
    `You can grab a time on my calendar here: ${s.booking_url}`,
    "",
    s.email_signature.trim(),
    "",
    "—",
    OPT_OUT_LINE,
    s.footer_address?.trim() || ADDRESS_PLACEHOLDER,
  ].join("\n");
}

export function withEmailFooter(body: string, s: FooterSettings): string {
  if (body.includes(OPT_OUT_LINE)) return body; // already has it
  return `${body.trim()}\n\n${buildEmailFooter(s)}`;
}

/** Phrases that imply guarantees. Flagged for Tim; never auto-approved. */
const RISKY_PATTERNS: [RegExp, string][] = [
  [/\bguarantee(d|s)?\b/i, "guarantee language"],
  [/\b(lowest|best|cheapest) (rate|price|premium)s?\b/i, "rate promise"],
  [/\bapproval is (certain|assured)\b|\byou('| wi)ll (be|get) approved\b/i, "approval promise"],
  [/\b\d+(\.\d+)?\s?% (return|growth|interest)\b|\bguaranteed return/i, "return promise"],
  [/\brisk[- ]free\b/i, "risk-free claim"],
  [/\(\d{3}\)\s?\d{3}-\d{4}|\b\d{3}[-.]\d{3}[-.]\d{4}\b/, "phone number"],
];

export function complianceWarnings(text: string): string[] {
  return RISKY_PATTERNS.filter(([re]) => re.test(text)).map(([, label]) => label);
}
