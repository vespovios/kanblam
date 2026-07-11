import { describe, it, expect, vi } from "vitest";
import {
  addSubscriber,
  removeSubscriber,
  dispatch,
  type Writer,
  type FanoutMap,
} from "@/lib/realtime/listener";

const mkWriter = (): Writer & { calls: string[] } => {
  const calls: string[] = [];
  const fn = ((data: string) => calls.push(data)) as unknown as Writer & { calls: string[] };
  fn.calls = calls;
  return fn;
};

describe("addSubscriber / removeSubscriber", () => {
  it("adds a writer to a workspace's set", () => {
    const map: FanoutMap = new Map();
    const w = mkWriter();
    addSubscriber(map, "ws_a", w);
    expect(map.get("ws_a")?.size).toBe(1);
  });

  it("multiple writers share a workspace set", () => {
    const map: FanoutMap = new Map();
    const w1 = mkWriter(), w2 = mkWriter();
    addSubscriber(map, "ws_a", w1);
    addSubscriber(map, "ws_a", w2);
    expect(map.get("ws_a")?.size).toBe(2);
  });

  it("removeSubscriber drops just that writer", () => {
    const map: FanoutMap = new Map();
    const w1 = mkWriter(), w2 = mkWriter();
    addSubscriber(map, "ws_a", w1);
    addSubscriber(map, "ws_a", w2);
    removeSubscriber(map, "ws_a", w1);
    expect(map.get("ws_a")?.has(w1)).toBe(false);
    expect(map.get("ws_a")?.has(w2)).toBe(true);
  });

  it("removeSubscriber cleans up the empty set entry", () => {
    const map: FanoutMap = new Map();
    const w = mkWriter();
    addSubscriber(map, "ws_a", w);
    removeSubscriber(map, "ws_a", w);
    expect(map.has("ws_a")).toBe(false);
  });

  it("removeSubscriber on an unknown workspace is a no-op", () => {
    const map: FanoutMap = new Map();
    expect(() => removeSubscriber(map, "ws_zzz", mkWriter())).not.toThrow();
  });
});

describe("dispatch", () => {
  it("writes to every subscriber of the matching workspace in SSE format", () => {
    const map: FanoutMap = new Map();
    const w1 = mkWriter(), w2 = mkWriter();
    addSubscriber(map, "ws_a", w1);
    addSubscriber(map, "ws_a", w2);
    dispatch(map, { workspaceId: "ws_a", kind: "tasks" });
    expect(w1.calls).toEqual([`data: {"kind":"tasks"}\n\n`]);
    expect(w2.calls).toEqual([`data: {"kind":"tasks"}\n\n`]);
  });

  it("does not cross workspaces — ws_a's writer never sees ws_b's events", () => {
    const map: FanoutMap = new Map();
    const wA = mkWriter(), wB = mkWriter();
    addSubscriber(map, "ws_a", wA);
    addSubscriber(map, "ws_b", wB);
    dispatch(map, { workspaceId: "ws_b", kind: "tasks" });
    expect(wA.calls).toEqual([]);
    expect(wB.calls).toEqual([`data: {"kind":"tasks"}\n\n`]);
  });

  it("dispatch to an unknown workspace is a no-op", () => {
    const map: FanoutMap = new Map();
    expect(() => dispatch(map, { workspaceId: "ws_zzz", kind: "tasks" })).not.toThrow();
  });
});
