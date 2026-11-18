import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/core/crypto";
import { extractText } from "@/core/google";

const KEY = "x".repeat(40);

describe("token encryption", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptSecret("refresh-token-123", KEY);
    const b = encryptSecret("refresh-token-123", KEY);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, KEY)).toBe("refresh-token-123");
  });
  it("fails with the wrong key or tampered data", () => {
    const enc = encryptSecret("secret", KEY);
    expect(() => decryptSecret(enc, "y".repeat(40))).toThrow();
    const parts = enc.split(":");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join(":"), KEY)).toThrow();
  });
  it("rejects short keys", () => {
    expect(() => encryptSecret("x", "short")).toThrow(/32 characters/);
  });
});

describe("gmail body extraction", () => {
  const b64 = (s: string) => Buffer.from(s).toString("base64url");
  it("prefers text/plain inside multipart", () => {
    const msg = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/html", body: { data: b64("<p>Hi <b>there</b></p>") } },
        { mimeType: "text/plain", body: { data: b64("Hi there") } },
      ],
    };
    expect(extractText(msg)).toBe("Hi there");
  });
  it("falls back to stripped HTML", () => {
    expect(extractText({ mimeType: "text/html", body: { data: b64("<style>x{}</style><p>Name:</p><p>Jo</p>") } }).trim()).toBe("Name:\nJo");
  });
});
