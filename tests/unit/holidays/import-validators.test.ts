import { describe, it, expect } from "vitest";
import { importPreviewSchema, importCommitSchema } from "@/lib/validators/holiday";

describe("importPreviewSchema", () => {
  it("accepts a valid region + year and uppercases the country", () => {
    const parsed = importPreviewSchema.parse({
      country: "gb",
      subdivision: "eng",
      year: 2026,
      includeObservances: true,
    });
    expect(parsed.country).toBe("GB");
    expect(parsed.subdivision).toBe("eng");
    expect(parsed.year).toBe(2026);
    expect(parsed.includeObservances).toBe(true);
  });

  it("defaults includeObservances to false and subdivision to null", () => {
    const parsed = importPreviewSchema.parse({ country: "AU", year: 2026 });
    expect(parsed.includeObservances).toBe(false);
    expect(parsed.subdivision).toBeNull();
  });

  it("rejects a bad country code and out-of-range year", () => {
    expect(importPreviewSchema.safeParse({ country: "GBR", year: 2026 }).success).toBe(false);
    expect(importPreviewSchema.safeParse({ country: "GB", year: 1800 }).success).toBe(false);
  });
});

describe("importCommitSchema", () => {
  it("requires at least one well-formed selected date", () => {
    expect(
      importCommitSchema.safeParse({ country: "GB", year: 2026, selectedDates: [] }).success,
    ).toBe(false);
    expect(
      importCommitSchema.safeParse({
        country: "GB",
        year: 2026,
        selectedDates: ["2026-12-25", "2026-12-26"],
      }).success,
    ).toBe(true);
  });

  it("rejects malformed dates", () => {
    expect(
      importCommitSchema.safeParse({ country: "GB", year: 2026, selectedDates: ["25/12/2026"] })
        .success,
    ).toBe(false);
  });
});
