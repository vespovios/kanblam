import { describe, it, expect } from "vitest";
import { createProjectSchema, updateProjectSchema } from "@/lib/validators/project";

describe("createProjectSchema", () => {
  it("accepts a valid minimal project", () => {
    const r = createProjectSchema.safeParse({
      name: "Website redesign",
      code: "P01",
      statusId: "status-cuid",
    });
    expect(r.success).toBe(true);
  });

  it("accepts all optional fields", () => {
    const r = createProjectSchema.safeParse({
      name: "Website",
      code: "P02",
      statusId: "s1",
      startDate: "2026-05-01",
      endDate: "2026-06-01",
      projectLeadId: "u1",
      clientName: "Acme Inc",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty name", () => {
    const r = createProjectSchema.safeParse({ name: "", code: "P01", statusId: "s1" });
    expect(r.success).toBe(false);
  });

  it("rejects missing code", () => {
    const r = createProjectSchema.safeParse({ name: "X", statusId: "s1" });
    expect(r.success).toBe(false);
  });

  it("rejects invalid date string", () => {
    const r = createProjectSchema.safeParse({
      name: "X",
      code: "P01",
      statusId: "s1",
      startDate: "not-a-date",
    });
    expect(r.success).toBe(false);
  });
});

describe("updateProjectSchema", () => {
  it("accepts partial update", () => {
    const r = updateProjectSchema.safeParse({ name: "Renamed" });
    expect(r.success).toBe(true);
  });

  it("accepts empty object", () => {
    const r = updateProjectSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("rejects name that is empty string", () => {
    const r = updateProjectSchema.safeParse({ name: "" });
    expect(r.success).toBe(false);
  });
});
