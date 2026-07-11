import { describe, it, expect } from "vitest";
import { resolveQuickAdd, type ResolveContext } from "@/lib/quick-add/resolve";
import type { ParsedQuickAdd } from "@/lib/quick-add/parse";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

const baseCtx: ResolveContext = {
  projects: [
    { id: "p-web", code: "WEB" },
    { id: "p-api", code: "API" },
  ],
  tags: [
    { id: "t-auth", name: "auth" },
    { id: "t-marketing", name: "marketing" },
  ],
  members: [
    { id: "u-peter", name: "Peter Anderson", email: "peter@test.local" },
    { id: "u-paul",  name: "Paul Bridges",   email: "paul@test.local"  },
    { id: "u-maya",  name: null,              email: "maya@test.local"  },
  ],
  priorities: [
    { id: "pri-low",    name: "Low" },
    { id: "pri-medium", name: "Medium" },
    { id: "pri-high",   name: "High" },
  ],
  defaultProjectId: "p-web",
  defaultPriorityId: "pri-medium",
  defaultKanbanStageId: "ks-backlog",
  currentUserId: "u-peter",
  now: utc(2026, 4, 29), // Wed
};

const baseParsed: ParsedQuickAdd = {
  name: "Fix login",
  projectCode: null,
  tagNames: [],
  dueDateKeyword: null,
  assigneeToken: null,
  isImportant: false,
  isUrgent: false,
  priorityKeyword: null,
  errors: [],
};

describe("resolveQuickAdd", () => {
  describe("project resolution", () => {
    it("uses defaultProjectId when no [CODE]", () => {
      const r = resolveQuickAdd(baseParsed, baseCtx);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.payload.projectId).toBe("p-web");
    });

    it("looks up by code (case-insensitive)", () => {
      const r = resolveQuickAdd({ ...baseParsed, projectCode: "API" }, baseCtx);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.payload.projectId).toBe("p-api");
    });

    it("errors on unknown code", () => {
      const r = resolveQuickAdd({ ...baseParsed, projectCode: "XYZ" }, baseCtx);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(" ")).toMatch(/Unknown project \[XYZ\]/);
    });

    it("errors when no projectCode AND defaultProjectId is null", () => {
      const r = resolveQuickAdd(baseParsed, { ...baseCtx, defaultProjectId: null });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(" ")).toMatch(/No projects yet/);
    });
  });

  describe("tag resolution", () => {
    it("matches existing tags case-insensitively", () => {
      const r = resolveQuickAdd({ ...baseParsed, tagNames: ["Auth", "Marketing"] }, baseCtx);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.payload.tagIds).toEqual(["t-auth", "t-marketing"]);
        expect(r.autoCreateTagNames).toEqual([]);
      }
    });

    it("collects unmatched names into autoCreateTagNames", () => {
      const r = resolveQuickAdd({ ...baseParsed, tagNames: ["auth", "newone", "another"] }, baseCtx);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.payload.tagIds).toEqual(["t-auth"]);
        expect(r.autoCreateTagNames).toEqual(["newone", "another"]);
      }
    });
  });

  describe("due date resolution", () => {
    it("turns keyword into ISO string", () => {
      const r = resolveQuickAdd({ ...baseParsed, dueDateKeyword: "fri" }, baseCtx);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.payload.dueDate).toBe("2026-05-01T00:00:00.000Z");
    });

    it("errors on bad ISO", () => {
      const r = resolveQuickAdd({ ...baseParsed, dueDateKeyword: "2026-13-01" }, baseCtx);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(" ")).toMatch(/Invalid date '2026-13-01'/);
    });
  });

  describe("assignee resolution", () => {
    it("defaults assigneeId to currentUserId when no @user token is parsed", () => {
      const result = resolveQuickAdd(
        { name: "no @ token", projectCode: null, tagNames: [], dueDateKeyword: null, assigneeToken: null, isImportant: false, isUrgent: false, priorityKeyword: null, errors: [] },
        {
          projects: [{ id: "p1", code: "WEB" }],
          tags: [],
          members: [{ id: "u1", name: "Alice", email: "alice@x" }],
          priorities: [{ id: "pr1", name: "Medium" }],
          defaultProjectId: "p1",
          defaultPriorityId: "pr1",
          defaultKanbanStageId: "k1",
          currentUserId: "u1",
          now: new Date("2026-05-03T00:00:00.000Z"),
        },
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.payload.assigneeId).toBe("u1");
    });

    it("matches by name substring (case-insensitive)", () => {
      const r = resolveQuickAdd({ ...baseParsed, assigneeToken: "peter" }, baseCtx);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.payload.assigneeId).toBe("u-peter");
    });

    it("matches by email-prefix substring", () => {
      const r = resolveQuickAdd({ ...baseParsed, assigneeToken: "maya" }, baseCtx);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.payload.assigneeId).toBe("u-maya");
    });

    it("errors on no matches", () => {
      const r = resolveQuickAdd({ ...baseParsed, assigneeToken: "nobody" }, baseCtx);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(" ")).toMatch(/No member matching @nobody/);
    });

    it("errors on multiple matches with candidates listed", () => {
      const r = resolveQuickAdd({ ...baseParsed, assigneeToken: "p" }, baseCtx);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        const msg = r.errors.join(" ");
        expect(msg).toMatch(/Ambiguous @p/);
        expect(msg).toMatch(/peter/);
        expect(msg).toMatch(/paul/);
      }
    });
  });

  describe("flags + defaults", () => {
    it("passes through important/urgent", () => {
      const r = resolveQuickAdd(
        { ...baseParsed, isImportant: true, isUrgent: true },
        baseCtx,
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.payload.isImportant).toBe(true);
        expect(r.payload.isUrgent).toBe(true);
      }
    });

    it("injects default kanbanStageId and priorityId", () => {
      const r = resolveQuickAdd(baseParsed, baseCtx);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.payload.kanbanStageId).toBe("ks-backlog");
        expect(r.payload.priorityId).toBe("pri-medium");
      }
    });
  });

  describe("priority resolution", () => {
    it("resolves !low to the Low priority id", () => {
      const r = resolveQuickAdd({ ...baseParsed, priorityKeyword: "low" }, baseCtx);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.payload.priorityId).toBe("pri-low");
    });

    it("resolves !med to the Medium priority id", () => {
      const r = resolveQuickAdd({ ...baseParsed, priorityKeyword: "med" }, baseCtx);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.payload.priorityId).toBe("pri-medium");
    });

    it("resolves !high to the High priority id", () => {
      const r = resolveQuickAdd({ ...baseParsed, priorityKeyword: "high" }, baseCtx);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.payload.priorityId).toBe("pri-high");
    });

    it("errors when the workspace has no matching priority", () => {
      const r = resolveQuickAdd(
        { ...baseParsed, priorityKeyword: "low" },
        { ...baseCtx, priorities: [{ id: "pri-medium", name: "Medium" }] },
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(" ")).toMatch(/No priority matching !low/);
    });

    it("falls back to defaultPriorityId when no priorityKeyword is provided", () => {
      const r = resolveQuickAdd(baseParsed, baseCtx);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.payload.priorityId).toBe("pri-medium");
    });
  });

  describe("error aggregation", () => {
    it("surfaces multiple errors at once (no short-circuit)", () => {
      const r = resolveQuickAdd(
        { ...baseParsed, projectCode: "XYZ", assigneeToken: "nobody" },
        baseCtx,
      );
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.errors.length).toBe(2);
        expect(r.errors.some((e) => /Unknown project \[XYZ\]/.test(e))).toBe(true);
        expect(r.errors.some((e) => /No member matching @nobody/.test(e))).toBe(true);
      }
    });
  });
});
