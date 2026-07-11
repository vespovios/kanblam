import { describe, it, expect } from "vitest";
import {
  computeProjectProgress,
  type ProjectProgressInput,
} from "@/lib/projects/progress";

/** Task fixture: progressPct + whether its stage is terminal. */
const t = (progressPct: number, isTerminal = false): ProjectProgressInput => ({
  progressPct,
  kanbanStage: { isTerminal },
});

describe("computeProjectProgress", () => {
  it("empty project: all zeros", () => {
    expect(computeProjectProgress([])).toEqual({
      avgProgress: 0,
      completedCount: 0,
      totalCount: 0,
    });
  });

  it("all tasks complete (terminal + 100%): 100% / N of N", () => {
    expect(computeProjectProgress([t(100, true), t(100, true), t(100, true)])).toEqual({
      avgProgress: 100,
      completedCount: 3,
      totalCount: 3,
    });
  });

  it("partial mix: averages progressPct, counts terminal stages", () => {
    // progress: (100 + 50 + 0) / 3 = 50; one terminal
    expect(computeProjectProgress([t(100, true), t(50), t(0)])).toEqual({
      avgProgress: 50,
      completedCount: 1,
      totalCount: 3,
    });
  });

  it("completedCount tracks the terminal stage, not progressPct", () => {
    // A task can be 100% but not in a terminal stage (not "done"), and a
    // task can be in a terminal stage at 0% (counts as done).
    const result = computeProjectProgress([
      t(100, false), // 100% but not terminal — not completed
      t(0, true), //   0% but terminal — completed
    ]);
    expect(result.completedCount).toBe(1);
    expect(result.totalCount).toBe(2);
    expect(result.avgProgress).toBe(50); // (100 + 0) / 2
  });

  it("rounds avgProgress to the nearest integer", () => {
    // (33 + 33 + 33) / 3 = 33
    expect(computeProjectProgress([t(33), t(33), t(33)]).avgProgress).toBe(33);
    // (1 + 2) / 2 = 1.5 → 2
    expect(computeProjectProgress([t(1), t(2)]).avgProgress).toBe(2);
    // (10 + 20 + 25) / 3 = 18.33… → 18
    expect(computeProjectProgress([t(10), t(20), t(25)]).avgProgress).toBe(18);
  });

  it("a project of all-zero-progress, no terminal stages: 0% / 0 of N", () => {
    expect(computeProjectProgress([t(0), t(0), t(0), t(0)])).toEqual({
      avgProgress: 0,
      completedCount: 0,
      totalCount: 4,
    });
  });
});
