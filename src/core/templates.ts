/**
 * Non-AI fallbacks. Used when no Anthropic key is configured, when the daily
 * AI budget is spent, or when an AI call fails, so inbound leads are never dropped.
 */

export interface SubmittedInfo {
  first_name?: string | null;
  path?: string | null;
  estimate?: number | null;
  estimate_text?: string | null;
  term?: string | null;
  details?: string | null;
  answers?: { question: string; answer: string }[];
}

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

export function followUpTemplate(s: SubmittedInfo): { subject: string; body: string } {
  const hi = s.first_name ? `Hi ${s.first_name},` : "Hi,";
  const what =
    s.estimate && s.path
      ? `It came back with about ${money(s.estimate)} for your ${s.path.toLowerCase()}`
      : s.estimate
        ? `It came back with about ${money(s.estimate)}`
        : "I hope it was a helpful starting point";
  return {
    subject: "Your coverage estimate",
    body: [
      hi,
      "",
      `Thanks for using the coverage calculator on my website. ${what}${s.term ? ` on a ${s.term.toLowerCase()}` : ""}.`,
      "",
      "A number like that is a good start, but it helps to talk through what's behind it and what you already have. I'm an independent agent, so I can compare options from several insurance companies rather than just one.",
      "",
      "If a free 20-minute call would be useful, you can pick a time that works for you below. No cost and no pressure.",
    ].join("\n"),
  };
}

export function callPrepTemplate(input: {
  name: string;
  email?: string | null;
  phone?: string | null;
  meeting?: string | null;
  submitted: SubmittedInfo;
  niche?: string | null;
}): string {
  const s = input.submitted;
  const lines: string[] = [];
  lines.push("## In one line");
  lines.push(
    `${input.name}${input.meeting ? `, meeting ${input.meeting}` : ""}. ${
      input.niche === "business_owner" ? "Business-related coverage." : s.path ? `Coverage for ${s.path.toLowerCase()}.` : ""
    }`.trim(),
  );
  lines.push("", "## What they submitted");
  if (s.path) lines.push(`- For: ${s.path}`);
  if (s.estimate) lines.push(`- Calculator estimate: ${money(s.estimate)}`);
  else if (s.estimate_text) lines.push(`- Calculator estimate: ${s.estimate_text}`);
  if (s.term) lines.push(`- Term chosen: ${s.term}`);
  if (s.details) lines.push(`- Breakdown: ${s.details}`);
  for (const a of s.answers ?? []) lines.push(`- ${a.question} ${a.answer}`);
  if (input.email) lines.push(`- Email: ${input.email}`);
  if (input.phone) lines.push(`- Phone: ${input.phone}`);
  lines.push("", "## What we found publicly", "- Research not run (AI research is off or over budget). Look them up before the call.");
  lines.push("", "## Discovery questions");
  const qs =
    input.niche === "business_owner"
      ? [
          "Tell me about the business: how long, how many people, who owns it?",
          "If you or a partner couldn't work tomorrow, what would happen to the business?",
          "Is there a buy-sell agreement? How is it funded today?",
          "Who are the one or two people the business would struggle without?",
          "What coverage do you have personally, and through the business?",
          "Are you looking for something temporary, or something that builds value over time?",
          "Just to confirm, do you live in Texas?",
        ]
      : [
          "What made you look into coverage now?",
          "Who depends on your income, and for how long?",
          "What coverage do you have today, including through work?",
          "How did the calculator number feel to you: high, low, about right?",
          "What monthly budget would feel comfortable?",
          "Any health changes or tobacco use I should know about for pricing?",
          "Just to confirm, do you live in Texas?",
        ];
  qs.forEach((q) => lines.push(`- ${q}`));
  lines.push("", "## Talking points");
  lines.push("- As an independent agent I compare several carriers to find the best fit, not one company's product.");
  lines.push("- Term is usually the most affordable way to cover a set number of years; permanent costs more but lasts and can build cash value.");
  if (input.niche === "business_owner") {
    lines.push("- Key person and buy-sell funding protect the business and the owners' families if the unexpected happens.");
  }
  lines.push("", "## Watch-outs", "- Don't promise approval, rates or returns: those depend on underwriting.");
  return lines.join("\n");
}
