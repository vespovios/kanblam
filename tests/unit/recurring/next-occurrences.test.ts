import { describe, it, expect } from "vitest";
import { nextOccurrences, type RecurrenceRule } from "@/lib/recurring/next-occurrences";

function d(iso: string): Date {
  return new Date(iso + "T00:00:00.000Z");
}

const baseDaily: RecurrenceRule = {
  frequency: "DAILY",
  interval: 1,
  daysOfWeek: [],
  startDate: d("2026-04-20"), // Mon
  endDate: null,
};

describe("nextOccurrences — DAILY", () => {
  it("emits every day from start to end of window", () => {
    const out = nextOccurrences(baseDaily, d("2026-04-20"), d("2026-04-23"));
    expect(out.map((x) => x.toISOString().slice(0, 10))).toEqual([
      "2026-04-20",
      "2026-04-21",
      "2026-04-22",
      "2026-04-23",
    ]);
  });

  it("respects interval (every 3 days)", () => {
    const rule: RecurrenceRule = { ...baseDaily, interval: 3 };
    const out = nextOccurrences(rule, d("2026-04-20"), d("2026-04-30"));
    expect(out.map((x) => x.toISOString().slice(0, 10))).toEqual([
      "2026-04-20",
      "2026-04-23",
      "2026-04-26",
      "2026-04-29",
    ]);
  });

  it("does not emit before startDate", () => {
    const rule: RecurrenceRule = { ...baseDaily, startDate: d("2026-04-25") };
    const out = nextOccurrences(rule, d("2026-04-20"), d("2026-04-27"));
    expect(out.map((x) => x.toISOString().slice(0, 10))).toEqual([
      "2026-04-25",
      "2026-04-26",
      "2026-04-27",
    ]);
  });

  it("stops at endDate inclusive", () => {
    const rule: RecurrenceRule = { ...baseDaily, endDate: d("2026-04-22") };
    const out = nextOccurrences(rule, d("2026-04-20"), d("2026-04-30"));
    expect(out.map((x) => x.toISOString().slice(0, 10))).toEqual([
      "2026-04-20",
      "2026-04-21",
      "2026-04-22",
    ]);
  });
});

describe("nextOccurrences — WEEKLY", () => {
  const baseWeekly: RecurrenceRule = {
    frequency: "WEEKLY",
    interval: 1,
    daysOfWeek: [1, 3, 5], // Mon, Wed, Fri (ISO)
    startDate: d("2026-04-20"), // Mon
    endDate: null,
  };

  it("emits on configured weekdays only", () => {
    const out = nextOccurrences(baseWeekly, d("2026-04-20"), d("2026-04-26"));
    expect(out.map((x) => x.toISOString().slice(0, 10))).toEqual([
      "2026-04-20", // Mon
      "2026-04-22", // Wed
      "2026-04-24", // Fri
    ]);
  });

  it("with interval=2, skips one full week between blocks", () => {
    const rule: RecurrenceRule = { ...baseWeekly, interval: 2, daysOfWeek: [2] }; // every other Tue
    // Tue 2026-04-21, then 2026-05-05, then 2026-05-19
    const out = nextOccurrences(rule, d("2026-04-20"), d("2026-05-25"));
    expect(out.map((x) => x.toISOString().slice(0, 10))).toEqual([
      "2026-04-21",
      "2026-05-05",
      "2026-05-19",
    ]);
  });

  it("with no daysOfWeek, defaults to startDate's weekday", () => {
    const rule: RecurrenceRule = { ...baseWeekly, daysOfWeek: [] }; // start is Mon
    const out = nextOccurrences(rule, d("2026-04-20"), d("2026-05-04"));
    expect(out.map((x) => x.toISOString().slice(0, 10))).toEqual([
      "2026-04-20",
      "2026-04-27",
      "2026-05-04",
    ]);
  });
});

describe("nextOccurrences — MONTHLY", () => {
  it("emits on the start day of each month", () => {
    const rule: RecurrenceRule = {
      frequency: "MONTHLY",
      interval: 1,
      daysOfWeek: [],
      startDate: d("2026-04-15"),
      endDate: null,
    };
    const out = nextOccurrences(rule, d("2026-04-15"), d("2026-08-15"));
    expect(out.map((x) => x.toISOString().slice(0, 10))).toEqual([
      "2026-04-15",
      "2026-05-15",
      "2026-06-15",
      "2026-07-15",
      "2026-08-15",
    ]);
  });

  it("interval=2 emits every other month", () => {
    const rule: RecurrenceRule = {
      frequency: "MONTHLY",
      interval: 2,
      daysOfWeek: [],
      startDate: d("2026-04-15"),
      endDate: null,
    };
    const out = nextOccurrences(rule, d("2026-04-15"), d("2026-10-15"));
    expect(out.map((x) => x.toISOString().slice(0, 10))).toEqual([
      "2026-04-15",
      "2026-06-15",
      "2026-08-15",
      "2026-10-15",
    ]);
  });

  it("clamps day to month length (Jan 31 → Feb 28 in non-leap)", () => {
    const rule: RecurrenceRule = {
      frequency: "MONTHLY",
      interval: 1,
      daysOfWeek: [],
      startDate: d("2027-01-31"),
      endDate: null,
    };
    const out = nextOccurrences(rule, d("2027-01-31"), d("2027-03-31"));
    expect(out.map((x) => x.toISOString().slice(0, 10))).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
    ]);
  });
});
