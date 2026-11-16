import { describe, expect, it } from "vitest";
import { ADDRESS_PLACEHOLDER, complianceWarnings, OPT_OUT_LINE, withEmailFooter } from "@/core/compliance";

const settings = { email_signature: "Tim Hermesmeyer", booking_url: "https://book.example", footer_address: null };

describe("email compliance footer", () => {
  it("adds booking link, opt-out line, and address placeholder", () => {
    const out = withEmailFooter("Hi Jane,", settings);
    expect(out).toContain("https://book.example");
    expect(out).toContain(OPT_OUT_LINE);
    expect(out).toContain(ADDRESS_PLACEHOLDER);
  });
  it("uses the real address once set, and is idempotent", () => {
    const s = { ...settings, footer_address: "PO Box 1, Dallas, TX" };
    const once = withEmailFooter("Hi", s);
    expect(withEmailFooter(once, s)).toBe(once);
    expect(once).not.toContain(ADDRESS_PLACEHOLDER);
  });
  it("flags guarantee, rate, and phone-number language", () => {
    expect(complianceWarnings("We guarantee the lowest rates. Call 214-555-1212")).toEqual([
      "guarantee language",
      "rate promise",
      "phone number",
    ]);
    expect(complianceWarnings("Happy to compare options across carriers.")).toEqual([]);
  });
});
