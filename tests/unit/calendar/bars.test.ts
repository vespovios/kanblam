import { describe, it, expect, vi } from "vitest";
import {
  classifyTask,
  splitBarIntoWeekSegments,
  assignLanes,
  barsForWeek,
  type BarTask,
} from "@/lib/calendar/bars";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const iso = (d: Date) => d.toISOString();

const task = (overrides: Partial<BarTask>): BarTask => ({
  id: "t",
  startDate: null,
  dueDate: null,
  ...overrides,
});

describe("classifyTask", () => {
  it("both dates null → hidden", () => {
    expect(classifyTask(task({}))).toBe("hidden");
  });

  it("dueDate only → single-pill", () => {
    expect(classifyTask(task({ dueDate: iso(utc(2026, 5, 1)) }))).toBe("single-pill");
  });

  it("startDate only, no dueDate → open-bar", () => {
    expect(classifyTask(task({ startDate: iso(utc(2026, 5, 1)) }))).toBe("open-bar");
  });

  it("startDate = dueDate → single-pill", () => {
    expect(classifyTask(task({ startDate: iso(utc(2026, 5, 1)), dueDate: iso(utc(2026, 5, 1)) }))).toBe("single-pill");
  });

  it("startDate < dueDate → multi-bar", () => {
    expect(classifyTask(task({ startDate: iso(utc(2026, 5, 1)), dueDate: iso(utc(2026, 5, 5)) }))).toBe("multi-bar");
  });

  it("startDate > dueDate (data corruption) → single-pill (defensive)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(classifyTask(task({ startDate: iso(utc(2026, 5, 5)), dueDate: iso(utc(2026, 5, 1)) }))).toBe("single-pill");
    warnSpy.mockRestore();
  });
});

describe("splitBarIntoWeekSegments", () => {
  // Week starts Monday (ISO 1).
  const monApr20 = utc(2026, 4, 20); // Mon
  const monApr27 = utc(2026, 4, 27); // Mon
  const monMay04 = utc(2026, 5, 4);  // Mon

  it("same-week bar (Tue-Thu) returns one segment with both edges definite", () => {
    const segs = splitBarIntoWeekSegments(utc(2026, 4, 21), utc(2026, 4, 23), monApr20);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({
      colStart: 2,
      colSpan: 3,
      leftEdge: "definite",
      rightEdge: "definite",
    });
  });

  it("spans 2 weeks (Wed week1 → Wed week2): two segments", () => {
    const segsW1 = splitBarIntoWeekSegments(utc(2026, 4, 22), utc(2026, 4, 29), monApr20);
    expect(segsW1).toHaveLength(1);
    expect(segsW1[0]).toMatchObject({ colStart: 3, colSpan: 5, leftEdge: "definite", rightEdge: "continuation" });
    const segsW2 = splitBarIntoWeekSegments(utc(2026, 4, 22), utc(2026, 4, 29), monApr27);
    expect(segsW2).toHaveLength(1);
    expect(segsW2[0]).toMatchObject({ colStart: 1, colSpan: 3, leftEdge: "continuation", rightEdge: "definite" });
  });

  it("spans 3 weeks (Wed → 2 weeks later Tue): middle segment has continuation on both sides", () => {
    const start = utc(2026, 4, 22), end = utc(2026, 5, 5);
    const w1 = splitBarIntoWeekSegments(start, end, monApr20);
    const w2 = splitBarIntoWeekSegments(start, end, monApr27);
    const w3 = splitBarIntoWeekSegments(start, end, monMay04);
    expect(w1[0]).toMatchObject({ leftEdge: "definite", rightEdge: "continuation" });
    expect(w2[0]).toMatchObject({ colStart: 1, colSpan: 7, leftEdge: "continuation", rightEdge: "continuation" });
    expect(w3[0]).toMatchObject({ leftEdge: "continuation", rightEdge: "definite" });
  });

  it("starts on Sunday, ends Monday next week: two 1-cell segments", () => {
    const sunApr26 = utc(2026, 4, 26), monApr27Date = utc(2026, 4, 27);
    const w1 = splitBarIntoWeekSegments(sunApr26, monApr27Date, monApr20);
    const w2 = splitBarIntoWeekSegments(sunApr26, monApr27Date, monApr27);
    expect(w1[0]).toMatchObject({ colStart: 7, colSpan: 1, leftEdge: "definite", rightEdge: "continuation" });
    expect(w2[0]).toMatchObject({ colStart: 1, colSpan: 1, leftEdge: "continuation", rightEdge: "definite" });
  });

  it("starts Monday, ends Sunday same week: full-week single segment", () => {
    const segs = splitBarIntoWeekSegments(monApr20, utc(2026, 4, 26), monApr20);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ colStart: 1, colSpan: 7, leftEdge: "definite", rightEdge: "definite" });
  });

  it("bar entirely outside the week returns no segments", () => {
    expect(splitBarIntoWeekSegments(utc(2026, 5, 1), utc(2026, 5, 3), monApr20)).toEqual([]);
  });
});

describe("assignLanes", () => {
  const seg = (id: string, colStart: number, colSpan: number) => ({ id, colStart, colSpan });

  it("0 segments: laneCount 0", () => {
    const out = assignLanes([]);
    expect(out.laneCount).toBe(0);
    expect(out.assignment.size).toBe(0);
  });

  it("1 segment: laneCount 1", () => {
    const out = assignLanes([seg("a", 1, 3)]);
    expect(out.laneCount).toBe(1);
    expect(out.assignment.get("a")).toBe(0);
  });

  it("3 non-overlapping segments → all in lane 0", () => {
    const out = assignLanes([seg("a", 1, 2), seg("b", 3, 2), seg("c", 5, 2)]);
    expect(out.laneCount).toBe(1);
    expect(out.assignment.get("a")).toBe(0);
    expect(out.assignment.get("b")).toBe(0);
    expect(out.assignment.get("c")).toBe(0);
  });

  it("3 fully-overlapping segments → 3 lanes", () => {
    const out = assignLanes([seg("a", 1, 7), seg("b", 1, 7), seg("c", 1, 7)]);
    expect(out.laneCount).toBe(3);
  });

  it("partial overlap: 2 overlap, 1 standalone → minimum lane count 2", () => {
    const out = assignLanes([seg("a", 1, 4), seg("b", 3, 3), seg("c", 6, 2)]);
    expect(out.laneCount).toBe(2);
    expect(out.assignment.get("c")).toBe(0); // can reuse lane 0 since "a" ends col 4 < 6
  });

  it("stable lane assignment regardless of input order (sorted by colStart, then by id)", () => {
    const a = assignLanes([seg("z", 3, 2), seg("a", 1, 2), seg("m", 5, 2)]);
    const b = assignLanes([seg("a", 1, 2), seg("m", 5, 2), seg("z", 3, 2)]);
    expect(a.assignment.get("a")).toBe(b.assignment.get("a"));
    expect(a.assignment.get("m")).toBe(b.assignment.get("m"));
    expect(a.assignment.get("z")).toBe(b.assignment.get("z"));
  });
});

describe("barsForWeek (composition)", () => {
  const monApr20 = utc(2026, 4, 20);

  it("0 tasks → no segments, laneCount 0", () => {
    const out = barsForWeek(monApr20, []);
    expect(out.segments).toEqual([]);
    expect(out.laneCount).toBe(0);
  });

  it("one multi-bar entirely in this week", () => {
    const out = barsForWeek(monApr20, [
      task({ id: "x", startDate: iso(utc(2026, 4, 21)), dueDate: iso(utc(2026, 4, 23)) }),
    ]);
    expect(out.segments).toHaveLength(1);
    expect(out.segments[0]).toMatchObject({
      task: expect.objectContaining({ id: "x" }),
      colStart: 2,
      colSpan: 3,
      leftEdge: "definite",
      rightEdge: "definite",
      lane: 0,
    });
    expect(out.laneCount).toBe(1);
  });

  it("one multi-bar entirely outside this week → no segments", () => {
    const out = barsForWeek(monApr20, [
      task({ id: "x", startDate: iso(utc(2026, 5, 1)), dueDate: iso(utc(2026, 5, 3)) }),
    ]);
    expect(out.segments).toEqual([]);
  });

  it("one multi-bar straddling start of week: continuation-left", () => {
    const out = barsForWeek(monApr20, [
      task({ id: "x", startDate: iso(utc(2026, 4, 18)), dueDate: iso(utc(2026, 4, 22)) }),
    ]);
    expect(out.segments[0]).toMatchObject({ colStart: 1, colSpan: 3, leftEdge: "continuation", rightEdge: "definite" });
  });

  it("one open-bar at Wed: 1 segment, definite left, open right, colSpan 1", () => {
    const out = barsForWeek(monApr20, [
      task({ id: "x", startDate: iso(utc(2026, 4, 22)), dueDate: null }),
    ]);
    expect(out.segments[0]).toMatchObject({ colStart: 3, colSpan: 1, leftEdge: "definite", rightEdge: "open" });
  });

  it("ignores single-pills and hidden tasks", () => {
    const out = barsForWeek(monApr20, [
      task({ id: "pill", dueDate: iso(utc(2026, 4, 22)) }),
      task({ id: "hidden", startDate: null, dueDate: null }),
    ]);
    expect(out.segments).toEqual([]);
  });
});
