import { describe, it, expect } from "vitest";
import { createTaskSchema, updateTaskSchema } from "@/lib/validators/task";

describe("createTaskSchema", () => {
  it("accepts minimal valid input", () => {
    const r = createTaskSchema.safeParse({
      projectId: "p1",
      name: "Task",
      priorityId: "pr1",
      kanbanStageId: "k1",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty name with a human-readable message (qa#3)", () => {
    const r = createTaskSchema.safeParse({
      projectId: "p1",
      name: "",
      priorityId: "pr1",
      kanbanStageId: "k1",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.find((i) => i.path.join(".") === "name")?.message;
      expect(msg).toBe("Task name is required");
    }
  });

  it("accepts full input", () => {
    const r = createTaskSchema.safeParse({
      projectId: "p1",
      name: "Task",
      description: "desc",
      isImportant: true,
      isUrgent: false,
      priorityId: "pr1",
      kanbanStageId: "k1",
      assigneeId: "u1",
      startDate: "2026-05-01",
      dueDate: "2026-05-05",
      progressPct: 50,
      notes: "n",
    });
    expect(r.success).toBe(true);
  });

  it("rejects progressPct > 100", () => {
    const r = createTaskSchema.safeParse({
      projectId: "p1",
      name: "T",
      priorityId: "pr1",
      kanbanStageId: "k1",
      progressPct: 200,
    });
    expect(r.success).toBe(false);
  });
});

describe("updateTaskSchema", () => {
  it("accepts partial", () => {
    expect(updateTaskSchema.safeParse({ name: "New" }).success).toBe(true);
  });

  it("accepts empty object", () => {
    expect(updateTaskSchema.safeParse({}).success).toBe(true);
  });

  it("accepts clearing optional fields with null", () => {
    expect(updateTaskSchema.safeParse({ assigneeId: null, dueDate: null }).success).toBe(true);
  });

  // Regression for QA report 2026-05-17 Issue #1: task edit Save was losing
  // priorityId, isImportant, and description. The schema is fine — these
  // assertions lock that down so any future change that strips them on parse
  // would be caught here. The actual bug was upstream in the form binding
  // (Select/Checkbox/Textarea now wrapped in Controller in task-edit-drawer).
  it("preserves priorityId, isImportant, and description on parse", () => {
    const r = updateTaskSchema.safeParse({
      priorityId: "low-id",
      isImportant: true,
      description: "QA description with special chars <script>alert(1)</script> & emoji ✅",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.priorityId).toBe("low-id");
      expect(r.data.isImportant).toBe(true);
      expect(r.data.description).toBe(
        "QA description with special chars <script>alert(1)</script> & emoji ✅",
      );
    }
  });

  // Moving a task between projects rides on the regular update schema —
  // projectId is optional and present only when the task is being moved.
  it("accepts projectId for moving a task between projects", () => {
    const r = updateTaskSchema.safeParse({ projectId: "project-2" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.projectId).toBe("project-2");
  });

  it("rejects an empty projectId", () => {
    expect(updateTaskSchema.safeParse({ projectId: "" }).success).toBe(false);
  });
});
