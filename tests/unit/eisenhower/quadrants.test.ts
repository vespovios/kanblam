import { describe, it, expect } from "vitest";
import { quadrantFlags, quadrantFor, QUADRANT_IDS } from "@/lib/eisenhower/quadrants";

describe("quadrantFlags", () => {
  it("q1 (do) → important + urgent", () => {
    expect(quadrantFlags("q1")).toEqual({ isImportant: true, isUrgent: true });
  });
  it("q2 (schedule) → important, not urgent", () => {
    expect(quadrantFlags("q2")).toEqual({ isImportant: true, isUrgent: false });
  });
  it("q3 (delegate) → not important, urgent", () => {
    expect(quadrantFlags("q3")).toEqual({ isImportant: false, isUrgent: true });
  });
  it("q4 (eliminate) → neither", () => {
    expect(quadrantFlags("q4")).toEqual({ isImportant: false, isUrgent: false });
  });
});

describe("quadrantFor", () => {
  it("both flags true → q1", () => {
    expect(quadrantFor({ isImportant: true, isUrgent: true })).toBe("q1");
  });
  it("important only → q2", () => {
    expect(quadrantFor({ isImportant: true, isUrgent: false })).toBe("q2");
  });
  it("urgent only → q3", () => {
    expect(quadrantFor({ isImportant: false, isUrgent: true })).toBe("q3");
  });
  it("neither → q4", () => {
    expect(quadrantFor({ isImportant: false, isUrgent: false })).toBe("q4");
  });
});

describe("QUADRANT_IDS", () => {
  it("lists all four in canonical order q1..q4", () => {
    expect(QUADRANT_IDS).toEqual(["q1", "q2", "q3", "q4"]);
  });
});
