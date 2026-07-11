import { describe, it, expect } from "vitest";
import {
  listCountries,
  listSubdivisions,
  computeHolidays,
} from "@/lib/holidays/catalog";

describe("listCountries", () => {
  it("returns a non-empty, name-sorted list including GB and US", () => {
    const countries = listCountries();
    expect(countries.length).toBeGreaterThan(50);
    const codes = countries.map((c) => c.code);
    expect(codes).toContain("GB");
    expect(codes).toContain("US");
    expect(codes).toContain("AU");
    const names = countries.map((c) => c.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
  });
});

describe("listSubdivisions", () => {
  it("returns GB constituent countries including England and Scotland", () => {
    const subs = listSubdivisions("GB");
    const codes = subs.map((s) => s.code);
    expect(codes).toContain("eng");
    expect(codes).toContain("sct");
  });

  it("returns US states including New York", () => {
    expect(listSubdivisions("US").map((s) => s.code)).toContain("ny");
  });

  it("returns an empty array for a country with no subdivisions data", () => {
    expect(listSubdivisions("VA")).toHaveLength(0);
  });

  it("returns an empty array (does not throw) for an unknown country code", () => {
    expect(listSubdivisions("ZZ")).toEqual([]);
  });
});

describe("computeHolidays", () => {
  it("includes Christmas (public) for England 2026 by default", () => {
    const list = computeHolidays("GB", "eng", 2026, false);
    const xmas = list.find((h) => h.date === "2026-12-25");
    expect(xmas).toBeDefined();
    expect(xmas!.type).toBe("public");
  });

  it("excludes observance-type days by default and includes them when opted in", () => {
    const dflt = computeHolidays("US", "ny", 2026, false);
    const withObs = computeHolidays("US", "ny", 2026, true);
    expect(dflt.every((h) => h.type === "public" || h.type === "bank")).toBe(true);
    expect(withObs.length).toBeGreaterThanOrEqual(dflt.length);
  });

  it("returns at most one entry per date (deduped) and sorted ascending", () => {
    const list = computeHolidays("US", "ny", 2026, true);
    const dates = list.map((h) => h.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect([...dates].sort()).toEqual(dates);
  });

  it("works without a subdivision (country-level)", () => {
    const list = computeHolidays("AU", null, 2026, false);
    expect(list.length).toBeGreaterThan(0);
  });

  it("computes a future year (no hardcoded data table)", () => {
    const list = computeHolidays("GB", "eng", 2030, false);
    expect(list.find((h) => h.date === "2030-12-25")).toBeDefined();
  });

  it("dedupes same-date collisions keeping the higher-priority type (US/CA 2024-03-31: public beats observance)", () => {
    // date-holidays emits two entries for 2024-03-31 in US/CA:
    //   "César Chávez Day" (public) and "Easter Sunday" (observance).
    // With includeObservances=true both types are in scope; the dedupe must
    // keep the public one and return exactly one entry for that date.
    const list = computeHolidays("US", "ca", 2024, true);
    const entries = list.filter((h) => h.date === "2024-03-31");
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("public");
  });
});
