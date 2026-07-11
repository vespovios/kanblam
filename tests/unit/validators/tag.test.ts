import { describe, it, expect } from "vitest";
import { tagNameSchema, createTagSchema, updateTagSchema } from "@/lib/validators/tag";

describe("tagNameSchema", () => {
  it("accepts plain names", () => {
    expect(tagNameSchema.safeParse("marketing").success).toBe(true);
    expect(tagNameSchema.safeParse("GTD").success).toBe(true);
  });

  it("accepts hyphens and underscores", () => {
    expect(tagNameSchema.safeParse("site-relaunch").success).toBe(true);
    expect(tagNameSchema.safeParse("tax_2026").success).toBe(true);
    expect(tagNameSchema.safeParse("a-b_c-d").success).toBe(true);
  });

  it("trims whitespace", () => {
    const r = tagNameSchema.safeParse("  marketing  ");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("marketing");
  });

  it("rejects empty after trim", () => {
    expect(tagNameSchema.safeParse("").success).toBe(false);
    expect(tagNameSchema.safeParse("   ").success).toBe(false);
  });

  it("rejects spaces", () => {
    expect(tagNameSchema.safeParse("site relaunch").success).toBe(false);
    expect(tagNameSchema.safeParse("hello world").success).toBe(false);
  });

  it("rejects special chars besides - and _", () => {
    expect(tagNameSchema.safeParse("hello!").success).toBe(false);
    expect(tagNameSchema.safeParse("a/b").success).toBe(false);
    expect(tagNameSchema.safeParse("a.b").success).toBe(false);
  });

  it("rejects names longer than 32 chars", () => {
    expect(tagNameSchema.safeParse("a".repeat(32)).success).toBe(true);
    expect(tagNameSchema.safeParse("a".repeat(33)).success).toBe(false);
  });
});

describe("createTagSchema", () => {
  it("accepts a valid name", () => {
    expect(createTagSchema.safeParse({ name: "marketing" }).success).toBe(true);
  });

  it("rejects bad names", () => {
    expect(createTagSchema.safeParse({ name: "site relaunch" }).success).toBe(false);
  });
});

describe("updateTagSchema", () => {
  it("accepts name only", () => {
    expect(updateTagSchema.safeParse({ name: "renamed" }).success).toBe(true);
  });

  it("accepts color only", () => {
    expect(updateTagSchema.safeParse({ color: "#aabbcc" }).success).toBe(true);
  });

  it("accepts both", () => {
    expect(updateTagSchema.safeParse({ name: "x", color: "#aabbcc" }).success).toBe(true);
  });

  it("accepts empty (no-op)", () => {
    expect(updateTagSchema.safeParse({}).success).toBe(true);
  });

  it("rejects invalid hex color", () => {
    expect(updateTagSchema.safeParse({ color: "red" }).success).toBe(false);
    expect(updateTagSchema.safeParse({ color: "#ZZZZZZ" }).success).toBe(false);
    expect(updateTagSchema.safeParse({ color: "#abc" }).success).toBe(false); // too short
  });
});
