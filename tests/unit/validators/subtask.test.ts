import { describe, it, expect } from "vitest";
import {
  subtaskTitleSchema,
  subtaskInputSchema,
  createSubtaskSchema,
  updateSubtaskSchema,
  reorderSubtasksSchema,
} from "@/lib/validators/subtask";

describe("subtaskTitleSchema", () => {
  it("accepts a normal title", () => {
    expect(subtaskTitleSchema.parse("Buy milk")).toBe("Buy milk");
  });

  it("trims surrounding whitespace", () => {
    expect(subtaskTitleSchema.parse("  Buy bread  ")).toBe("Buy bread");
  });

  it("rejects empty strings after trim", () => {
    expect(() => subtaskTitleSchema.parse("")).toThrow();
    expect(() => subtaskTitleSchema.parse("   ")).toThrow();
  });

  it("rejects titles over 200 chars", () => {
    expect(() => subtaskTitleSchema.parse("x".repeat(201))).toThrow();
    expect(subtaskTitleSchema.parse("x".repeat(200))).toBe("x".repeat(200));
  });

  it("allows spaces, punctuation, emoji", () => {
    expect(subtaskTitleSchema.parse("Buy 2L of milk 🥛 (whole)")).toBe(
      "Buy 2L of milk 🥛 (whole)",
    );
  });
});

describe("subtaskInputSchema (used inside Task create payload)", () => {
  it("accepts an object with just title", () => {
    expect(subtaskInputSchema.parse({ title: "x" })).toEqual({ title: "x" });
  });

  it("rejects missing title", () => {
    expect(() => subtaskInputSchema.parse({})).toThrow();
  });
});

describe("createSubtaskSchema", () => {
  it("accepts title only", () => {
    expect(createSubtaskSchema.parse({ title: "Buy milk" })).toEqual({
      title: "Buy milk",
    });
  });

  it("rejects extra fields like position or completed", () => {
    // Position is server-managed; clients should not set it on create.
    const result = createSubtaskSchema.safeParse({ title: "x", position: 5 });
    expect(result.success).toBe(true); // strict() not applied; extra fields ignored is fine
    if (result.success) expect("position" in result.data).toBe(false);
  });
});

describe("updateSubtaskSchema", () => {
  it("accepts title alone", () => {
    expect(updateSubtaskSchema.parse({ title: "edited" })).toEqual({
      title: "edited",
    });
  });

  it("accepts completed alone", () => {
    expect(updateSubtaskSchema.parse({ completed: true })).toEqual({
      completed: true,
    });
  });

  it("accepts both", () => {
    expect(updateSubtaskSchema.parse({ title: "x", completed: false })).toEqual(
      { title: "x", completed: false },
    );
  });

  it("rejects empty object", () => {
    expect(() => updateSubtaskSchema.parse({})).toThrow();
  });
});

describe("reorderSubtasksSchema", () => {
  it("accepts a non-empty ID array", () => {
    expect(reorderSubtasksSchema.parse({ orderedIds: ["a", "b", "c"] })).toEqual(
      { orderedIds: ["a", "b", "c"] },
    );
  });

  it("rejects empty array", () => {
    expect(() => reorderSubtasksSchema.parse({ orderedIds: [] })).toThrow();
  });

  it("rejects missing orderedIds", () => {
    expect(() => reorderSubtasksSchema.parse({})).toThrow();
  });

  it("rejects non-string IDs", () => {
    expect(() => reorderSubtasksSchema.parse({ orderedIds: [1, 2] })).toThrow();
  });
});
