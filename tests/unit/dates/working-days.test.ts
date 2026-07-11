import { describe, it, expect } from "vitest";
import { isWorkingDay } from "@/lib/dates/working-days";

// ISO weekday: 1=Mon, 2=Tue, …, 7=Sun
const MON_FRI = [1, 2, 3, 4, 5];
const MON_SAT = [1, 2, 3, 4, 5, 6];
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

function d(iso: string): Date {
  return new Date(iso + "T12:00:00Z");
}

describe("isWorkingDay", () => {
  it("Monday with Mon–Fri config → true", () => {
    expect(isWorkingDay(d("2026-04-20"), MON_FRI, [])).toBe(true);
  });

  it("Saturday with Mon–Fri config → false", () => {
    expect(isWorkingDay(d("2026-04-25"), MON_FRI, [])).toBe(false);
  });

  it("Sunday with Mon–Sat config → false", () => {
    expect(isWorkingDay(d("2026-04-26"), MON_SAT, [])).toBe(false);
  });

  it("Monday that is a holiday → false", () => {
    const monday = d("2026-04-20");
    expect(isWorkingDay(monday, MON_FRI, [d("2026-04-20")])).toBe(false);
  });

  it("Weekend that is in workingDays but also a holiday → false", () => {
    const sat = d("2026-04-25");
    expect(isWorkingDay(sat, ALL_DAYS, [sat])).toBe(false);
  });

  it("Matches holidays by calendar date regardless of time", () => {
    const mondayNoon = d("2026-04-20");
    const mondayMidnight = new Date("2026-04-20T00:00:00Z");
    expect(isWorkingDay(mondayNoon, MON_FRI, [mondayMidnight])).toBe(false);
  });
});
