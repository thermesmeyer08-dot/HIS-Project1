import { describe, expect, it } from "vitest";
import { findDuplicateContact, findDuplicateOrg } from "@/core/dedupe";

const contacts = [
  { id: "1", first_name: "Jane", last_name: "Doe", email: "jane@acme.com", linkedin_url: null, org_name: "Acme" },
  { id: "2", first_name: "Sam", last_name: "Lee", email: null, linkedin_url: "https://www.linkedin.com/in/samlee", org_name: null },
  { id: "3", first_name: "Bob", last_name: "Smith", email: null, linkedin_url: null, org_name: "Smith HVAC LLC" },
];

describe("contact dedupe", () => {
  it("matches on email first", () => {
    expect(findDuplicateContact({ email: "JANE@acme.com", first_name: "Other" }, contacts)).toMatchObject({
      reason: "email",
      record: { id: "1" },
    });
  });
  it("matches on LinkedIn", () => {
    expect(findDuplicateContact({ linkedin_url: "linkedin.com/in/SamLee/" }, contacts)?.record.id).toBe("2");
  });
  it("matches on name + org, ignoring suffixes", () => {
    expect(findDuplicateContact({ first_name: "bob", last_name: "smith", org_name: "Smith HVAC" }, contacts)?.reason).toBe(
      "name_org",
    );
  });
  it("does not match on name alone", () => {
    expect(findDuplicateContact({ first_name: "Bob", last_name: "Smith" }, contacts)).toBeNull();
  });
});

describe("organization dedupe", () => {
  const orgs = [
    { id: "a", name: "Acme Plumbing LLC", website: "https://acmeplumbing.com", city: "Plano" },
    { id: "b", name: "Lone Star Dental", website: null, city: "Frisco" },
  ];
  it("matches on domain", () => {
    expect(findDuplicateOrg({ name: "Totally different", website: "www.acmeplumbing.com/contact" }, orgs)?.record.id).toBe("a");
  });
  it("matches on name + city", () => {
    expect(findDuplicateOrg({ name: "Lone Star Dental, PLLC", city: "frisco" }, orgs)?.reason).toBe("name_city");
  });
  it("same name in a different city is a different business", () => {
    expect(findDuplicateOrg({ name: "Lone Star Dental", city: "Austin" }, orgs)).toBeNull();
  });
});
