import { describe, it, expect } from "vitest";
import { formatPreview } from "@/lib/quick-add/preview";
import type { ParsedQuickAdd } from "@/lib/quick-add/parse";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

const baseParsed: ParsedQuickAdd = {
  name: "",
  projectCode: null,
  tagNames: [],
  dueDateKeyword: null,
  assigneeToken: null,
  isImportant: false,
  isUrgent: false,
  priorityKeyword: null,
  errors: [],
};

const baseCtx = { defaultProjectCode: "WEB", now: utc(2026, 4, 29) };

describe("formatPreview", () => {
  it("returns empty string when parsed has no name and no markers", () => {
    expect(formatPreview(baseParsed, baseCtx)).toBe("");
  });

  it("renders just the name and the resolved project when nothing else set", () => {
    const r = formatPreview({ ...baseParsed, name: "Fix login" }, baseCtx);
    expect(r).toBe('→ "Fix login" · WEB');
  });

  it("uses [CODE] override over default", () => {
    const r = formatPreview(
      { ...baseParsed, name: "Fix login", projectCode: "API" },
      baseCtx,
    );
    expect(r).toBe('→ "Fix login" · API');
  });

  it("renders tags, due, assignee, flags in order", () => {
    const r = formatPreview(
      {
        ...baseParsed,
        name: "Fix login",
        tagNames: ["auth", "api"],
        dueDateKeyword: "fri",
        assigneeToken: "peter",
        isImportant: true,
        isUrgent: true,
      },
      baseCtx,
    );
    expect(r).toBe(
      '→ "Fix login" · WEB · #auth · #api · due Fri May 1 · @peter · !important · !urgent',
    );
  });

  it("renders ISO due date in the same human format", () => {
    const r = formatPreview(
      { ...baseParsed, name: "Fix login", dueDateKeyword: "2026-12-25" },
      baseCtx,
    );
    expect(r).toBe('→ "Fix login" · WEB · due Fri Dec 25');
  });

  it("renders the priority token between assignee and flags", () => {
    const r = formatPreview(
      {
        ...baseParsed,
        name: "Fix login",
        priorityKeyword: "high",
        isUrgent: true,
      },
      baseCtx,
    );
    expect(r).toBe('→ "Fix login" · WEB · !high · !urgent');
  });
});
