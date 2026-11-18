import { describe, expect, it } from "vitest";
import { complianceWarnings, withEmailFooter } from "@/core/compliance";
import { estimateCost } from "@/core/ai";
import { callPrepTemplate, followUpTemplate } from "@/core/templates";

const settings = { email_signature: "Tim", booking_url: "https://book.example", footer_address: "PO Box 1, Dallas, TX" };

describe("follow-up template", () => {
  it("references what they submitted and stays compliant", () => {
    const t = followUpTemplate({ first_name: "Jordan", path: "Family", estimate: 1250000, term: "20-year term" });
    expect(t.body).toContain("Hi Jordan,");
    expect(t.body).toContain("$1,250,000");
    expect(t.body).toContain("family");
    const full = withEmailFooter(t.body, settings);
    expect(full).toContain("https://book.example");
    expect(complianceWarnings(`${t.subject}\n${full}`)).toEqual([]);
  });
  it("works with almost nothing submitted", () => {
    const t = followUpTemplate({});
    expect(t.body.startsWith("Hi,")).toBe(true);
    expect(t.body).not.toContain("undefined");
  });
});

describe("call prep template", () => {
  it("includes the submission, Texas check, and honest term/permanent note", () => {
    const b = callPrepTemplate({
      name: "Casey Fictional",
      meeting: "Nov 20, 4:00 PM",
      niche: "business_owner",
      submitted: { answers: [{ question: "What number did the calculator give you?", answer: "2.5 million" }] },
    });
    expect(b).toContain("2.5 million");
    expect(b).toMatch(/buy-sell/i);
    expect(b).toMatch(/live in Texas/);
    expect(b).toMatch(/permanent costs more/);
    expect(complianceWarnings(b)).toEqual([]);
  });
});

describe("cost estimate", () => {
  it("prices tokens and web searches", () => {
    // 10k in + 2k out on Sonnet 5.5 = 0.02 + 0.02, plus 3 searches = 0.03
    expect(estimateCost("claude-sonnet-5-5", 10_000, 2_000, 3)).toBeCloseTo(0.07, 5);
    expect(estimateCost("claude-haiku-5-5", 1_000_000, 0)).toBeCloseTo(0.1, 5);
  });
});
