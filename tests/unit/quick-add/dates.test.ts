import { describe, it, expect } from "vitest";
import { resolveDueKeyword } from "@/lib/quick-add/dates";

// Helper: produce a UTC-midnight Date for a given Y/M/D.
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe("resolveDueKeyword", () => {
  it("today → today at UTC midnight", () => {
    const now = utc(2026, 4, 29); // Wed
    expect(resolveDueKeyword("today", now)).toEqual(utc(2026, 4, 29));
  });

  it("tomorrow → today + 1", () => {
    const now = utc(2026, 4, 29);
    expect(resolveDueKeyword("tomorrow", now)).toEqual(utc(2026, 4, 30));
  });

  it("normalizes 'now' even if it has time-of-day components", () => {
    const now = new Date(Date.UTC(2026, 3, 29, 14, 30, 0));
    expect(resolveDueKeyword("today", now)).toEqual(utc(2026, 4, 29));
  });

  describe("weekday — today-or-next semantics", () => {
    it("fri on Wed → upcoming Fri (2 days later)", () => {
      const now = utc(2026, 4, 29); // Wed
      expect(resolveDueKeyword("fri", now)).toEqual(utc(2026, 5, 1));
    });

    it("fri on Fri → same day (today)", () => {
      const now = utc(2026, 5, 1); // Fri
      expect(resolveDueKeyword("fri", now)).toEqual(utc(2026, 5, 1));
    });

    it("mon on Fri → next Mon (3 days later)", () => {
      const now = utc(2026, 5, 1); // Fri
      expect(resolveDueKeyword("mon", now)).toEqual(utc(2026, 5, 4));
    });

    it("sun on Sat → next day", () => {
      const now = utc(2026, 5, 2); // Sat
      expect(resolveDueKeyword("sun", now)).toEqual(utc(2026, 5, 3));
    });

    it("sat on Sun → 6 days later", () => {
      const now = utc(2026, 5, 3); // Sun
      expect(resolveDueKeyword("sat", now)).toEqual(utc(2026, 5, 9));
    });
  });

  describe("ISO YYYY-MM-DD", () => {
    it("returns the parsed date at UTC midnight", () => {
      const now = utc(2026, 4, 29);
      expect(resolveDueKeyword("2026-12-25", now)).toEqual(utc(2026, 12, 25));
    });

    it("returns null for unparseable date strings", () => {
      const now = utc(2026, 4, 29);
      expect(resolveDueKeyword("2026-13-01", now)).toBeNull(); // month 13
    });

    it("returns null for shape-OK but invalid dates", () => {
      const now = utc(2026, 4, 29);
      expect(resolveDueKeyword("2026-02-30", now)).toBeNull(); // Feb 30
    });
  });
});
