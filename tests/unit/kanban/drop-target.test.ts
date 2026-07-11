import { describe, it, expect } from "vitest";
import { resolveDropTarget, isNoOpDrop } from "@/lib/kanban/drop-target";

const stages = ["s1", "s2", "s3"] as const;

describe("resolveDropTarget", () => {
  it("returns null when overId is unknown", () => {
    expect(resolveDropTarget("a", "unknown", stages, { s1: ["a"], s2: [], s3: [] })).toBeNull();
  });

  it("returns null when active === over (drop on self)", () => {
    expect(resolveDropTarget("a", "a", stages, { s1: ["a"], s2: [], s3: [] })).toBeNull();
  });

  it("drops on empty column → newIndex 0", () => {
    const out = resolveDropTarget("a", "s2", stages, { s1: ["a"], s2: [], s3: [] });
    expect(out).toEqual({ destStageId: "s2", newIndex: 0 });
  });

  it("drops on column with N items (active from different stage) → newIndex N", () => {
    const out = resolveDropTarget("z", "s2", stages, { s1: ["z"], s2: ["a", "b"], s3: [] });
    expect(out).toEqual({ destStageId: "s2", newIndex: 2 });
  });

  it("drops on column chrome of source stage → append at current end of source (same stage)", () => {
    // active "a" is in s1. Drop on s1 chrome. Filtered list [b]. newIndex = 1 (end).
    const out = resolveDropTarget("a", "s1", stages, { s1: ["a", "b"], s2: [], s3: [] });
    expect(out).toEqual({ destStageId: "s1", newIndex: 1 });
  });

  it("drops on first card in another stage → newIndex 0", () => {
    const out = resolveDropTarget("a", "x", stages, { s1: ["a"], s2: ["x", "y"], s3: [] });
    expect(out).toEqual({ destStageId: "s2", newIndex: 0 });
  });

  it("drops on middle card in another stage → newIndex = that position", () => {
    const out = resolveDropTarget("a", "y", stages, { s1: ["a"], s2: ["x", "y", "z"], s3: [] });
    expect(out).toEqual({ destStageId: "s2", newIndex: 1 });
  });

  it("drops on card earlier in same stage (moving up) → filtered index", () => {
    // List [a, b, c], moving c onto a. Filtered list excluding c: [a, b]. indexOf a = 0.
    const out = resolveDropTarget("c", "a", stages, { s1: ["a", "b", "c"], s2: [], s3: [] });
    expect(out).toEqual({ destStageId: "s1", newIndex: 0 });
  });

  it("drops on card later in same stage (moving down) → filtered index", () => {
    // List [a, b, c], moving a onto c. Filtered list excluding a: [b, c]. indexOf c = 1.
    const out = resolveDropTarget("a", "c", stages, { s1: ["a", "b", "c"], s2: [], s3: [] });
    expect(out).toEqual({ destStageId: "s1", newIndex: 1 });
  });
});

describe("isNoOpDrop", () => {
  it("returns false when source and destination stages differ", () => {
    expect(
      isNoOpDrop("s1", "a", { destStageId: "s2", newIndex: 0 }, { s1: ["a"], s2: [] }),
    ).toBe(false);
  });

  it("returns false when same stage but different position", () => {
    // active 'a' at index 0, newIndex 2 — real move.
    expect(
      isNoOpDrop("s1", "a", { destStageId: "s1", newIndex: 2 }, { s1: ["a", "b", "c"] }),
    ).toBe(false);
  });

  it("returns true when dropping onto the card immediately after active (visual no-op)", () => {
    // [a, b, c], moving 'a' onto 'b'. Filtered [b, c], b at index 0. newIndex=0.
    // indexOf(a) in source = 0. 0 === 0 → no-op.
    expect(
      isNoOpDrop("s1", "a", { destStageId: "s1", newIndex: 0 }, { s1: ["a", "b", "c"] }),
    ).toBe(true);
  });

  it("returns true when active is the last card and drop lands at end", () => {
    // [a, b, c], moving 'c' — dropping in place. source indexOf = 2, newIndex = 2.
    expect(
      isNoOpDrop("s1", "c", { destStageId: "s1", newIndex: 2 }, { s1: ["a", "b", "c"] }),
    ).toBe(true);
  });

  it("returns false when source stage is missing from tasksByStage", () => {
    // Defensive: unknown source stage → not a no-op (will fall through to real move or another guard).
    expect(
      isNoOpDrop("unknown", "a", { destStageId: "unknown", newIndex: 0 }, {}),
    ).toBe(false);
  });
});
