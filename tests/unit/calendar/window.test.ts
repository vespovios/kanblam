import { describe, it, expect } from "vitest";
import { visibleWindow, gridDays } from "@/lib/calendar/window";

function d(iso: string): Date {
  return new Date(iso + "T00:00:00.000Z");
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

describe("visibleWindow — month view", () => {
  it("April 2026 returns 35-day window (Apr 1 is Wednesday)", () => {
    const w = visibleWindow("month", d("2026-04-15"));
    expect(iso(w.from)).toBe("2026-03-30");
    expect(iso(w.to)).toBe("2026-05-03");
    expect(w.days).toHaveLength(35);
  });

  it("February 2026 returns 35-day window (Feb 1 is Sunday, non-leap year)", () => {
    const w = visibleWindow("month", d("2026-02-10"));
    expect(iso(w.from)).toBe("2026-01-26");
    expect(iso(w.to)).toBe("2026-03-01");
    expect(w.days).toHaveLength(35);
  });

  it("August 2026 returns 42-day window (Aug 1 is Saturday with 31-day month)", () => {
    const w = visibleWindow("month", d("2026-08-15"));
    expect(iso(w.from)).toBe("2026-07-27");
    expect(iso(w.to)).toBe("2026-09-06");
    expect(w.days).toHaveLength(42);
  });

  it("February 2027 returns 28-day window (Feb 1 2027 is a Monday with 28-day month)", () => {
    const w = visibleWindow("month", d("2027-02-10"));
    expect(iso(w.from)).toBe("2027-02-01");
    expect(iso(w.to)).toBe("2027-02-28");
    expect(w.days).toHaveLength(28);
  });

  it("January 2026 spans into Dec 2025", () => {
    const w = visibleWindow("month", d("2026-01-15"));
    expect(iso(w.from)).toBe("2025-12-29");
  });

  it("December 2026 spans into Jan 2027", () => {
    const w = visibleWindow("month", d("2026-12-15"));
    expect(iso(w.to)).toBe("2027-01-03");
  });
});

describe("visibleWindow — week view", () => {
  it("Wednesday returns Mon→Sun bracketing", () => {
    const w = visibleWindow("week", d("2026-04-22")); // Wed
    expect(iso(w.from)).toBe("2026-04-20");
    expect(iso(w.to)).toBe("2026-04-26");
    expect(w.days).toHaveLength(7);
  });

  it("when input IS a Monday, returns the same Monday", () => {
    const w = visibleWindow("week", d("2026-04-20")); // Mon
    expect(iso(w.from)).toBe("2026-04-20");
    expect(iso(w.to)).toBe("2026-04-26");
  });

  it("when input IS a Sunday, returns the Mon BEFORE through that Sun", () => {
    const w = visibleWindow("week", d("2026-04-26")); // Sun
    expect(iso(w.from)).toBe("2026-04-20");
    expect(iso(w.to)).toBe("2026-04-26");
  });
});

describe("gridDays", () => {
  it("month returns the same dates as visibleWindow.days", () => {
    const days = gridDays("month", d("2026-04-15"));
    expect(days).toHaveLength(35);
    expect(iso(days[0])).toBe("2026-03-30");
    expect(iso(days[34])).toBe("2026-05-03");
  });

  it("week returns exactly 7 dates starting Monday", () => {
    const days = gridDays("week", d("2026-04-22"));
    expect(days).toHaveLength(7);
    expect(iso(days[0])).toBe("2026-04-20");
    expect(iso(days[6])).toBe("2026-04-26");
  });

  it("all returned dates are UTC midnight", () => {
    const days = gridDays("week", d("2026-04-22"));
    for (const day of days) {
      expect(day.getUTCHours()).toBe(0);
      expect(day.getUTCMinutes()).toBe(0);
      expect(day.getUTCSeconds()).toBe(0);
      expect(day.getUTCMilliseconds()).toBe(0);
    }
  });
});
