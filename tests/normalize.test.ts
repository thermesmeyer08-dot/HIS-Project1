import { describe, expect, it } from "vitest";
import {
  normalizeDomain,
  normalizeEmail,
  normalizeLinkedIn,
  normalizeOrgName,
  normalizePersonName,
} from "@/core/normalize";
import { isTexas, normalizeState } from "@/core/texas";

describe("normalize", () => {
  it("emails", () => {
    expect(normalizeEmail("  Jane@Acme.COM ")).toBe("jane@acme.com");
    expect(normalizeEmail("not an email")).toBeNull();
  });
  it("domains", () => {
    expect(normalizeDomain("https://www.Acme.com/about?x=1")).toBe("acme.com");
    expect(normalizeDomain("acme-plumbing.co")).toBe("acme-plumbing.co");
    expect(normalizeDomain("jane@acme.com")).toBe("acme.com");
    expect(normalizeDomain("nonsense")).toBeNull();
  });
  it("linkedin", () => {
    expect(normalizeLinkedIn("https://www.linkedin.com/in/Jane-Doe/?utm=x")).toBe("linkedin.com/in/jane-doe");
    expect(normalizeLinkedIn("https://example.com/in/jane")).toBeNull();
  });
  it("org names strip legal suffixes and punctuation", () => {
    expect(normalizeOrgName("The Acme Plumbing Co., LLC")).toBe("acme plumbing");
    expect(normalizeOrgName("Smith & Sons, Inc.")).toBe("smith and sons");
    expect(normalizeOrgName("LLC")).toBe("llc");
  });
  it("person names drop titles", () => {
    expect(normalizePersonName("Dr. José", "García Jr.")).toBe("jose garcia");
  });
  it("texas", () => {
    expect(isTexas("TX")).toBe(true);
    expect(isTexas(" texas ")).toBe(true);
    expect(isTexas("OK")).toBe(false);
    expect(isTexas("")).toBeNull();
    expect(normalizeState("Texas")).toBe("TX");
    expect(normalizeState("ok")).toBe("OK");
  });
});
