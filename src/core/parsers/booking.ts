import { nicheFrom, normalizePhone, parseAmount, splitName, type Niche } from "./shared";

/** A Google Calendar appointment-schedule booking (from the event description). */
export interface BookingDetails {
  kind: "booking";
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  answers: { question: string; answer: string }[];
  niche: Niche | null;
  calculator_amount: number | null;
  calculator_answer: string | null;
}

/** Strip HTML that Calendar sometimes puts in descriptions. */
function toText(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\r\n/g, "\n");
}

export function isBookingDescription(description: string | null | undefined): boolean {
  return /(^|\n)\s*Booked by\s*\n/i.test(toText(description ?? ""));
}

/**
 * Parse the "Booked by" block Google writes into the event description:
 *
 *   Booked by
 *   Jane Doe
 *   jane@example.com
 *   5555550123
 *
 *   Question one?
 *   Answer one
 *
 *   (then the appointment page's own description text)
 */
export function parseBookingDescription(description: string): BookingDetails | null {
  const text = toText(description);
  const start = text.search(/(^|\n)\s*Booked by\s*\n/i);
  if (start < 0) return null;
  const blocks = text
    .slice(start)
    .replace(/^\s*Booked by\s*\n/i, "")
    .split(/\n\s*\n/)
    .map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((b) => b.length);
  if (!blocks.length) return null;

  // First block: name, email, phone (any order after the name).
  const who = blocks[0];
  const email = who.find((l) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l))?.toLowerCase() ?? null;
  const phoneLine = who.find((l) => l !== email && /\d{7,}|\(\d{3}\)/.test(l.replace(/[^\d()]/g, "")));
  const name = who.find((l) => l !== email && l !== phoneLine) ?? null;

  // Following blocks: "Question?" + answer, until the page description starts.
  const answers: BookingDetails["answers"] = [];
  for (const b of blocks.slice(1)) {
    if (b.length >= 2 && b[0].endsWith("?")) {
      answers.push({ question: b[0], answer: b.slice(1).join(" ").trim() });
    } else {
      break;
    }
  }
  const find = (re: RegExp) => answers.find((a) => re.test(a.question))?.answer ?? null;
  const purpose = find(/family|home|business/i);
  const calc = find(/calculator|number|amount|coverage/i);

  return {
    kind: "booking",
    name,
    ...splitName(name),
    email,
    phone: normalizePhone(phoneLine),
    answers,
    niche: nicheFrom(purpose),
    calculator_amount: parseAmount(calc),
    calculator_answer: calc,
  };
}

/** "Free 20-minute coverage review (Jane Doe)" -> "Jane Doe" */
export function nameFromBookingTitle(summary: string | null | undefined): string | null {
  const m = (summary ?? "").match(/\(([^()]+)\)\s*$/);
  return m ? m[1].trim() : null;
}
