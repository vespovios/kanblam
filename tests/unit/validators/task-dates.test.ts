import { describe, it, expect } from "vitest";
import { createTaskSchema, updateTaskSchema } from "@/lib/validators/task";

describe("startDate <= dueDate refine", () => {
  const baseCreate = {
    projectId: "p1",
    name: "x",
    priorityId: "pr1",
    kanbanStageId: "k1",
  };

  it("accepts when both dates omitted", () => {
    expect(createTaskSchema.safeParse(baseCreate).success).toBe(true);
  });

  it("accepts when startDate is set but dueDate is not", () => {
    const r = createTaskSchema.safeParse({ ...baseCreate, startDate: "2026-05-01" });
    expect(r.success).toBe(true);
  });

  it("accepts when start = due", () => {
    const r = createTaskSchema.safeParse({ ...baseCreate, startDate: "2026-05-01", dueDate: "2026-05-01" });
    expect(r.success).toBe(true);
  });

  it("rejects when startDate > dueDate (create schema)", () => {
    const r = createTaskSchema.safeParse({ ...baseCreate, startDate: "2026-05-05", dueDate: "2026-05-01" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const flat = r.error.flatten();
      expect(flat.fieldErrors.startDate?.[0]).toMatch(/Start date must be on or before due date/);
    }
  });

  it("rejects when startDate > dueDate (update schema)", () => {
    const r = updateTaskSchema.safeParse({ startDate: "2026-05-05", dueDate: "2026-05-01" });
    expect(r.success).toBe(false);
  });
});
