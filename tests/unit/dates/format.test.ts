import { describe, it, expect } from "vitest";
import { formatShortDate } from "@/lib/dates/format";

describe("formatShortDate", () => {
  it("renders a Date as 'D Mon YYYY' (unambiguous, locale-independent)", () => {
    const r = formatShortDate(new Date("2026-05-16T12:00:00.000Z"));
    expect(r).toBe("16 May 2026");
  });

  it("accepts an ISO string", () => {
    expect(formatShortDate("2026-12-25T00:00:00.000Z")).toBe("25 Dec 2026");
  });

  it("returns the default placeholder for null", () => {
    expect(formatShortDate(null)).toBe("—");
  });

  it("returns the default placeholder for undefined", () => {
    expect(formatShortDate(undefined)).toBe("—");
  });

  it("returns the custom placeholder when supplied", () => {
    expect(formatShortDate(null, "n/a")).toBe("n/a");
  });

  it("returns the placeholder for unparseable input", () => {
    expect(formatShortDate("not a date")).toBe("—");
  });

  // Regression: the QA scenario rendered '5/16/2026' and '5/18/2026' on a UK
  // tester's screen, which read as 16 May vs 18 May ambiguously. The output
  // now spells the month so this can never recur.
  it("does not produce an ambiguous numeric form", () => {
    const r = formatShortDate(new Date("2026-05-16T00:00:00.000Z"));
    expect(r).not.toMatch(/^\d+\/\d+\/\d+$/);
    expect(r).toMatch(/May/);
  });
});
