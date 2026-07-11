import { describe, it, expect } from "vitest";
import { resolveLaneDrop } from "@/lib/kanban/resolve-lane-drop";

describe("resolveLaneDrop", () => {
  it("returns card-only when over has no lane data (none mode or cell-less drop)", () => {
    expect(resolveLaneDrop({ stageId: "s1", laneId: "l1" }, undefined)).toBe("card-only");
    expect(resolveLaneDrop({ stageId: "s1", laneId: "l1" }, {})).toBe("card-only");
    expect(resolveLaneDrop(undefined, undefined)).toBe("card-only");
  });

  it("returns same-cell when active and over share stageId and laneId", () => {
    expect(
      resolveLaneDrop(
        { stageId: "s1", laneId: "l1" },
        { stageId: "s1", laneId: "l1" },
      ),
    ).toBe("same-cell");
  });

  it("returns cross-cell when over has lane data and active is missing or differs", () => {
    // Lane-cell drop (active is the dragged card with lane data, over is a
    // cell or another card in a different cell).
    expect(
      resolveLaneDrop(
        { stageId: "s1", laneId: "l1" },
        { stageId: "s2", laneId: "l1" },
      ),
    ).toBe("cross-cell");
    expect(
      resolveLaneDrop(
        { stageId: "s1", laneId: "l1" },
        { stageId: "s1", laneId: "l2" },
      ),
    ).toBe("cross-cell");
    // Active without lane data (e.g., dragged from a non-lane source) but
    // dropped onto a cell or lane-aware card — still routes to cross-cell so
    // the lane-cell branch handles the destination.
    expect(resolveLaneDrop(undefined, { stageId: "s1", laneId: "l1" })).toBe("cross-cell");
  });
});
