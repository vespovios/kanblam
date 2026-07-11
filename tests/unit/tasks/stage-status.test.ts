import { describe, it, expect } from "vitest";
import {
  stageKind,
  isDoneStage,
  isCancelledStage,
  findCompleteTarget,
  findReopenTarget,
  type StageLike,
} from "@/lib/tasks/stage-status";

// Default seeded board: Ideas → In Progress → On Hold → Completed → Cancelled.
const BOARD: StageLike[] = [
  { id: "ideas", name: "Ideas", isTerminal: false, order: 0 },
  { id: "inprog", name: "In Progress", isTerminal: false, order: 1 },
  { id: "hold", name: "On Hold", isTerminal: false, order: 2 },
  { id: "done", name: "Completed", isTerminal: true, order: 3 },
  { id: "cancelled", name: "Cancelled", isTerminal: false, order: 4 },
];

describe("stageKind", () => {
  it("classifies a terminal stage as done", () => {
    expect(stageKind({ name: "Completed", isTerminal: true })).toBe("done");
  });
  it("classifies the Cancelled stage as cancelled (it is non-terminal)", () => {
    expect(stageKind({ name: "Cancelled", isTerminal: false })).toBe("cancelled");
  });
  it("classifies everything else as active", () => {
    expect(stageKind({ name: "In Progress", isTerminal: false })).toBe("active");
    expect(stageKind({ name: "Ideas", isTerminal: false })).toBe("active");
  });
  it("treats a terminal stage as done even if it were named Cancelled", () => {
    // isTerminal wins — done is defined by the flag, not the name.
    expect(stageKind({ name: "Cancelled", isTerminal: true })).toBe("done");
  });
});

describe("isDoneStage / isCancelledStage", () => {
  it("done is purely the isTerminal flag", () => {
    expect(isDoneStage({ isTerminal: true })).toBe(true);
    expect(isDoneStage({ isTerminal: false })).toBe(false);
  });
  it("cancelled requires the name AND non-terminal", () => {
    expect(isCancelledStage({ name: "Cancelled", isTerminal: false })).toBe(true);
    expect(isCancelledStage({ name: "Cancelled", isTerminal: true })).toBe(false);
    expect(isCancelledStage({ name: "On Hold", isTerminal: false })).toBe(false);
  });
});

describe("findCompleteTarget", () => {
  it("returns the earliest terminal stage", () => {
    expect(findCompleteTarget(BOARD)?.id).toBe("done");
  });
  it("returns null when no terminal stage exists", () => {
    expect(findCompleteTarget(BOARD.filter((s) => !s.isTerminal))).toBeNull();
  });
});

describe("findReopenTarget", () => {
  it("returns the first active (non-terminal, non-cancelled) stage", () => {
    expect(findReopenTarget(BOARD)?.id).toBe("ideas");
  });
  it("skips Cancelled when picking a reopen target", () => {
    const noEarlyActive = BOARD.filter((s) => s.isTerminal || s.name === "Cancelled");
    // Only Completed (terminal) + Cancelled remain → no valid reopen target.
    expect(findReopenTarget(noEarlyActive)).toBeNull();
  });
  it("respects order, not array position", () => {
    const shuffled = [...BOARD].reverse();
    expect(findReopenTarget(shuffled)?.id).toBe("ideas");
  });
});
