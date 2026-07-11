import { describe, it, expect } from "vitest";
import { colorFromName, PALETTE, tagTextColor } from "@/lib/tags/color";

describe("colorFromName", () => {
  it("returns a string from the PALETTE", () => {
    const c = colorFromName("marketing");
    expect(PALETTE).toContain(c);
  });

  it("is deterministic — same name always returns the same color", () => {
    expect(colorFromName("marketing")).toBe(colorFromName("marketing"));
    expect(colorFromName("urgent")).toBe(colorFromName("urgent"));
  });

  it("is case-insensitive", () => {
    expect(colorFromName("Marketing")).toBe(colorFromName("marketing"));
    expect(colorFromName("MARKETING")).toBe(colorFromName("marketing"));
  });

  it("is whitespace-insensitive at edges", () => {
    expect(colorFromName("  marketing  ")).toBe(colorFromName("marketing"));
  });

  it("distributes across all 12 buckets for varied inputs", () => {
    const names = [
      "marketing", "urgent", "tax", "errands", "home", "work",
      "personal", "client", "internal", "external", "review", "blocked",
      "research", "meetings", "follow-up", "billing", "ops", "design",
      "engineering", "support",
    ];
    const seen = new Set(names.map(colorFromName));
    // Expect at least 8 distinct buckets out of 20 names (no degenerate hash).
    expect(seen.size).toBeGreaterThanOrEqual(8);
  });

  it("PALETTE has exactly 12 entries", () => {
    expect(PALETTE).toHaveLength(12);
  });

  it("every PALETTE entry is a valid hex color", () => {
    for (const c of PALETTE) {
      expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("PALETTE and TEXT_PALETTE have matching lengths (so buckets line up)", () => {
    // We don't expose TEXT_PALETTE, so verify indirectly: tagTextColor must
    // not throw for any name (would only happen if TEXT_PALETTE were shorter
    // than PALETTE, leaving some bucket indices out of bounds). Sweep enough
    // varied inputs to hit every bucket index 0..PALETTE.length-1.
    const names = [
      "marketing", "urgent", "tax", "errands", "home", "work",
      "personal", "client", "internal", "external", "review", "blocked",
      "research", "meetings", "follow-up", "billing", "ops", "design",
      "engineering", "support", "a", "b", "c", "d", "e",
      "f", "g", "h", "i", "j", "k", "l", "m", "n", "o",
    ];
    for (const n of names) {
      const txt = tagTextColor(n);
      expect(txt).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
