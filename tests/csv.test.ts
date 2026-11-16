import { describe, expect, it } from "vitest";
import { parseImportCsv, toCsv } from "@/core/csv";

const defaults = { source: "CSV import", consent_note: "Business card from chamber mixer" };

describe("CSV import", () => {
  it("parses aliased headers, products, and fills source defaults", () => {
    const csv = [
      "First Name,Last Name,Email,Company,State,Products,Create_Lead,Stage",
      "Jane,Doe,jane@acme.com,Acme LLC,Texas,key person; buy-sell,yes,new",
    ].join("\n");
    const { rows, errors } = parseImportCsv(csv, defaults);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      first_name: "Jane",
      organization: "Acme LLC",
      state: "TX",
      product_interest: ["key_person", "buy_sell"],
      create_lead: true,
      stage: "new",
      contact_type: "prospect",
      source: "CSV import",
    });
  });
  it("reports bad rows with line numbers and keeps good ones", () => {
    const csv = ["first_name,email,score", "Ann,not-an-email,50", "Ben,ben@x.com,101", "Cal,cal@x.com,80"].join("\n");
    const { rows, errors } = parseImportCsv(csv, defaults);
    expect(rows.map((r) => r.first_name)).toEqual(["Cal"]);
    expect(errors.map((e) => e.line)).toEqual([2, 3]);
  });
  it("requires a source and consent note", () => {
    const { rows, errors } = parseImportCsv("first_name\nAnn", { source: "", consent_note: "" });
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/source/i);
  });
});

describe("CSV export", () => {
  it("joins arrays and neutralizes formula injection", () => {
    const out = toCsv([{ name: "=HYPERLINK(1)", products: ["key_person", "buy_sell"], n: null }]);
    expect(out).toContain("'=HYPERLINK(1)");
    expect(out).toContain("key_person; buy_sell");
  });
});
