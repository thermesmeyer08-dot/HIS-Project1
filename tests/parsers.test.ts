import { describe, expect, it } from "vitest";
import { isCalculatorEmail, parseCalculatorEmail } from "@/core/parsers/calculator";
import { isBookingDescription, nameFromBookingTitle, parseBookingDescription } from "@/core/parsers/booking";
import { nicheFrom, normalizePhone, parseAmount, splitName } from "@/core/parsers/shared";

// All people below are invented. The layout mirrors the real notifications.
const CALC = `Path:
Family

Estimate:
$1,250,000

Term:
20-year term

Details:
Income replacement: $900,000; Mortgage payoff: $310,000; College: $80,000; Debts: $20,000; Final expenses: $15,000; minus existing: $75,000

Name:
Jordan Example

Email:
Jordan.Example@Example.com

Mobile (optional):
214-555-0147

Consent:
yes`;

const BOOKING = `Booked by
Casey Fictional
casey@fictional-co.example
9725550199

Is this for your family, your home, or your business?
Bussiness

What number did the calculator give you?
2.5 million

Free 20-minute coverage review with Tim Hermesmeyer

Thanks for booking. We'll use this time to:

    - Look at your coverage number from the calculator, or figure it out together
`;

describe("calculator email parser", () => {
  it("recognizes the Netlify notification", () => {
    expect(isCalculatorEmail("hermesmeyerinsurance.com <formresponses@netlify.com>", "From HIS", CALC)).toBe(true);
    expect(isCalculatorEmail("someone@else.com", "From HIS", CALC)).toBe(false);
  });
  it("extracts every field", () => {
    const p = parseCalculatorEmail(CALC)!;
    expect(p).toMatchObject({
      name: "Jordan Example",
      first_name: "Jordan",
      last_name: "Example",
      email: "jordan.example@example.com",
      phone: "(214) 555-0147",
      path: "Family",
      niche: "family",
      estimate: 1250000,
      term: "20-year term",
      consent: true,
    });
    expect(p.details).toContain("Mortgage payoff: $310,000");
  });
  it("handles a missing phone, single name, and no consent", () => {
    const p = parseCalculatorEmail(
      CALC.replace("Jordan Example", "Jordan").replace("214-555-0147", "").replace("Consent:\nyes", "Consent:\n"),
    )!;
    expect(p.first_name).toBe("Jordan");
    expect(p.last_name).toBeNull();
    expect(p.phone).toBeNull();
    expect(p.consent).toBe(false);
  });
  it("rejects a submission without an email", () => {
    expect(parseCalculatorEmail(CALC.replace(/Email:\n.*\n/, ""))).toBeNull();
  });
  it("tolerates Windows line endings", () => {
    expect(parseCalculatorEmail(CALC.replace(/\n/g, "\r\n"))?.estimate).toBe(1250000);
  });
});

describe("booking description parser", () => {
  it("detects booking events", () => {
    expect(isBookingDescription(BOOKING)).toBe(true);
    expect(isBookingDescription("Team lunch")).toBe(false);
  });
  it("extracts who booked and their answers", () => {
    const b = parseBookingDescription(BOOKING)!;
    expect(b).toMatchObject({
      name: "Casey Fictional",
      email: "casey@fictional-co.example",
      phone: "(972) 555-0199",
      niche: "business_owner",
      calculator_amount: 2500000,
    });
    expect(b.answers).toHaveLength(2);
    expect(b.answers[0].question).toMatch(/family, your home/);
  });
  it("parses the HTML form of the description", () => {
    const html = BOOKING.replace(/\n/g, "<br>").replace("Booked by<br>", "<b>Booked by</b><br>");
    expect(parseBookingDescription(html)?.email).toBe("casey@fictional-co.example");
  });
  it("reads the name from the event title", () => {
    expect(nameFromBookingTitle("Free 20-minute coverage review (Casey Fictional)")).toBe("Casey Fictional");
  });
});

describe("shared helpers", () => {
  it("amounts", () => {
    expect(parseAmount("$1,500,000")).toBe(1500000);
    expect(parseAmount("7 million ")).toBe(7000000);
    expect(parseAmount("750k")).toBe(750000);
    expect(parseAmount("not sure")).toBeNull();
  });
  it("niche", () => {
    expect(nicheFrom("Bussiness ")).toBe("business_owner");
    expect(nicheFrom("Family")).toBe("family");
    expect(nicheFrom("Home")).toBe("home");
    expect(nicheFrom("")).toBeNull();
  });
  it("phone and names", () => {
    expect(normalizePhone("1 (469) 555-0100")).toBe("(469) 555-0100");
    expect(splitName("Mary Ann Example")).toEqual({ first_name: "Mary Ann", last_name: "Example" });
  });
});
