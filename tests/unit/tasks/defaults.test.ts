import { describe, it, expect } from "vitest";
import { pickDefaultPriorityId } from "@/lib/tasks/defaults";

describe("pickDefaultPriorityId", () => {
  it("prefers a priority named Medium (case-insensitive) over the first entry", () => {
    expect(
      pickDefaultPriorityId([
        { id: "low", name: "Low" },
        { id: "med", name: "medium" },
        { id: "high", name: "High" },
      ]),
    ).toBe("med");
  });

  it("falls back to the first priority when no Medium exists", () => {
    expect(
      pickDefaultPriorityId([
        { id: "low", name: "Low" },
        { id: "high", name: "High" },
      ]),
    ).toBe("low");
  });

  it("throws on empty input rather than returning an empty string", () => {
    expect(() => pickDefaultPriorityId([])).toThrow(/no priorities/i);
  });
});
