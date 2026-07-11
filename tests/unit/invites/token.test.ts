import { describe, it, expect } from "vitest";
import { generateToken, hashToken } from "@/lib/invites/token";

describe("generateToken", () => {
  it("returns a 64-char hex string", () => {
    const token = generateToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a different value each call", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
  });
});

describe("hashToken", () => {
  it("returns a deterministic 64-char hex hash", () => {
    const token = "a".repeat(64);
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different hashes for different tokens", () => {
    expect(hashToken("a".repeat(64))).not.toBe(hashToken("b".repeat(64)));
  });
});
