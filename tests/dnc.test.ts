import { describe, expect, it } from "vitest";
import { assertContactable, DoNotContactError, findDncMatch, normalizeDncValue, type DncEntry } from "@/core/dnc";

const list: DncEntry[] = [
  { kind: "email", value_normalized: "blocked@acme.com" },
  { kind: "domain", value_normalized: "nocalls.com" },
  { kind: "linkedin", value_normalized: "linkedin.com/in/jane-doe" },
  { kind: "name_org", value_normalized: "bob smith|smith hvac" },
];

describe("do-not-contact enforcement", () => {
  it("blocks an exact email match regardless of case", () => {
    expect(findDncMatch({ email: "Blocked@ACME.com" }, list)?.kind).toBe("email");
  });
  it("blocks anyone at a blocked email domain", () => {
    expect(findDncMatch({ email: "anyone@nocalls.com" }, list)?.kind).toBe("domain");
  });
  it("blocks when the organization's website is on a blocked domain", () => {
    expect(findDncMatch({ email: "x@gmail.com" }, list, "Whatever", "https://www.nocalls.com")?.kind).toBe("domain");
  });
  it("blocks by LinkedIn URL", () => {
    expect(findDncMatch({ linkedin_url: "https://linkedin.com/in/Jane-Doe/" }, list)?.kind).toBe("linkedin");
  });
  it("blocks by name + organization even with suffix differences", () => {
    expect(findDncMatch({ first_name: "Bob", last_name: "Smith" }, list, "Smith HVAC, LLC")?.kind).toBe("name_org");
  });
  it("blocks when the contact itself is flagged", () => {
    expect(findDncMatch({ email: "ok@fine.com", do_not_contact: true }, list)).not.toBeNull();
  });
  it("allows everyone else", () => {
    expect(findDncMatch({ first_name: "Bob", last_name: "Smith", email: "bob@other.com" }, list, "Other Co")).toBeNull();
    expect(() => assertContactable({ email: "fine@ok.com" }, list)).not.toThrow();
  });
  it("assertContactable throws a typed error", () => {
    expect(() => assertContactable({ email: "blocked@acme.com" }, list)).toThrow(DoNotContactError);
  });
  it("normalizes values Tim types into the DNC list", () => {
    expect(normalizeDncValue("email", " Foo@Bar.com ")).toBe("foo@bar.com");
    expect(normalizeDncValue("domain", "https://www.bar.com/x")).toBe("bar.com");
    expect(normalizeDncValue("name_org", "Bob Smith | Smith HVAC LLC")).toBe("bob smith|smith hvac");
    expect(normalizeDncValue("name_org", "no pipe")).toBeNull();
  });
});
