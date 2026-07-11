export type BarClass = "hidden" | "single-pill" | "multi-bar" | "open-bar";

export type EdgeKind = "definite" | "continuation" | "open";

export interface BarTask {
  id: string;
  startDate: string | null; // ISO datetime
  dueDate: string | null;   // ISO datetime
}

export interface BarSegment {
  task: BarTask;
  colStart: number;  // 1..7 (Mon=1, Sun=7)
  colSpan: number;   // 1..7
  leftEdge: EdgeKind;
  rightEdge: EdgeKind;
  lane: number;      // 0-based; row inside the overlay
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcMidnight(iso: string): Date {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_PER_DAY);
}

export function classifyTask(task: BarTask): BarClass {
  if (!task.startDate && !task.dueDate) return "hidden";
  if (!task.startDate && task.dueDate) return "single-pill";
  if (task.startDate && !task.dueDate) return "open-bar";
  // both set
  const sk = dateKey(utcMidnight(task.startDate!));
  const dk = dateKey(utcMidnight(task.dueDate!));
  if (sk === dk) return "single-pill";
  if (sk > dk) {
    console.warn(`[bars] task ${task.id} has startDate > dueDate`);
    return "single-pill";
  }
  return "multi-bar";
}

/**
 * Split a date range into segment(s) intersecting the given week (Mon..Sun).
 * Each segment is a `colStart`/`colSpan` pair (1..7 indexing) with edge flags
 * indicating whether each side is a real endpoint (`definite`) or split mid-task
 * (`continuation`). The `open` edge is added separately by the caller for open-bar.
 */
export function splitBarIntoWeekSegments(
  start: Date,
  end: Date,
  weekStart: Date,
): Omit<BarSegment, "task" | "lane">[] {
  const weekEndExclusive = addDays(weekStart, 7);
  // Reject if range doesn't overlap this week.
  if (end < weekStart || start >= weekEndExclusive) return [];

  const segStart = start < weekStart ? weekStart : start;
  const segEndInclusive = end >= weekEndExclusive ? addDays(weekEndExclusive, -1) : end;

  const startDayOffset = Math.round((segStart.getTime() - weekStart.getTime()) / MS_PER_DAY);
  const endDayOffset = Math.round((segEndInclusive.getTime() - weekStart.getTime()) / MS_PER_DAY);

  const colStart = startDayOffset + 1;
  const colSpan = endDayOffset - startDayOffset + 1;
  const leftEdge: EdgeKind = start < weekStart ? "continuation" : "definite";
  const rightEdge: EdgeKind = end >= weekEndExclusive ? "continuation" : "definite";

  return [{ colStart, colSpan, leftEdge, rightEdge }];
}

/**
 * Greedy interval coloring. Sort segments by colStart (then by id for
 * determinism) and place each in the first lane where it doesn't overlap.
 */
export function assignLanes(
  segments: { id: string; colStart: number; colSpan: number }[],
): { laneCount: number; assignment: Map<string, number> } {
  if (segments.length === 0) return { laneCount: 0, assignment: new Map() };
  const sorted = [...segments].sort((a, b) =>
    a.colStart !== b.colStart ? a.colStart - b.colStart : a.id.localeCompare(b.id),
  );
  // lanes[i] = lastEndCol (inclusive) of the segment placed in lane i.
  const lanesEnd: number[] = [];
  const assignment = new Map<string, number>();
  for (const seg of sorted) {
    let placedLane = -1;
    for (let i = 0; i < lanesEnd.length; i++) {
      if (lanesEnd[i] < seg.colStart) {
        placedLane = i;
        break;
      }
    }
    if (placedLane === -1) {
      placedLane = lanesEnd.length;
      lanesEnd.push(0);
    }
    lanesEnd[placedLane] = seg.colStart + seg.colSpan - 1;
    assignment.set(seg.id, placedLane);
  }
  return { laneCount: lanesEnd.length, assignment };
}

/** Compose classifyTask + splitBarIntoWeekSegments + assignLanes for one week. */
export function barsForWeek(
  weekStart: Date,
  tasks: BarTask[],
): { laneCount: number; segments: BarSegment[] } {
  // Invariant: splitBarIntoWeekSegments returns 0 or 1 segments per call, so
  // each task contributes at most one entry to `raw` here. The Map keying by
  // task.id below is therefore collision-free.
  const raw: { task: BarTask; partial: Omit<BarSegment, "task" | "lane"> }[] = [];

  for (const t of tasks) {
    const cls = classifyTask(t);
    if (cls === "multi-bar") {
      const start = utcMidnight(t.startDate!);
      const end = utcMidnight(t.dueDate!);
      for (const part of splitBarIntoWeekSegments(start, end, weekStart)) {
        raw.push({ task: t, partial: part });
      }
    } else if (cls === "open-bar") {
      const start = utcMidnight(t.startDate!);
      // 1-cell wide; open right edge.
      const parts = splitBarIntoWeekSegments(start, start, weekStart);
      for (const part of parts) {
        raw.push({ task: t, partial: { ...part, rightEdge: "open" } });
      }
    }
    // single-pill / hidden are not the bar-overlay's concern.
  }

  const lanes = assignLanes(raw.map((r) => ({ id: r.task.id, colStart: r.partial.colStart, colSpan: r.partial.colSpan })));
  const segments: BarSegment[] = raw.map((r) => ({
    task: r.task,
    colStart: r.partial.colStart,
    colSpan: r.partial.colSpan,
    leftEdge: r.partial.leftEdge,
    rightEdge: r.partial.rightEdge,
    lane: lanes.assignment.get(r.task.id) ?? 0,
  }));
  return { laneCount: lanes.laneCount, segments };
}
