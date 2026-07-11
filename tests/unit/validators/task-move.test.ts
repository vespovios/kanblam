import { describe, it, expect } from "vitest";
import { moveTaskSchema } from "@/lib/validators/task-move";

describe("moveTaskSchema", () => {
  it("accepts a kanbanStageId without newIndex", () => {
    expect(moveTaskSchema.safeParse({ kanbanStageId: "stage1" }).success).toBe(true);
  });

  it("accepts kanbanStageId with integer newIndex >= 0", () => {
    expect(moveTaskSchema.safeParse({ kanbanStageId: "stage1", newIndex: 0 }).success).toBe(true);
    expect(moveTaskSchema.safeParse({ kanbanStageId: "stage1", newIndex: 5 }).success).toBe(true);
  });

  it("rejects negative newIndex", () => {
    expect(moveTaskSchema.safeParse({ kanbanStageId: "stage1", newIndex: -1 }).success).toBe(false);
  });

  it("rejects non-integer newIndex", () => {
    expect(moveTaskSchema.safeParse({ kanbanStageId: "stage1", newIndex: 1.5 }).success).toBe(false);
  });

  it("rejects missing kanbanStageId", () => {
    expect(moveTaskSchema.safeParse({ newIndex: 0 }).success).toBe(false);
  });
});
