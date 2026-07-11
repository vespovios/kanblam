import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { coalesce } from "@/lib/realtime/coalesce";

describe("coalesce (per-kind debounce)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires once after the window for a single event", () => {
    const fired: string[] = [];
    const c = coalesce<string>((kind) => fired.push(kind), 150);
    c.enqueue("tasks");
    expect(fired).toEqual([]);
    vi.advanceTimersByTime(150);
    expect(fired).toEqual(["tasks"]);
  });

  it("collapses a rapid burst of the same kind into one fire", () => {
    const fired: string[] = [];
    const c = coalesce<string>((kind) => fired.push(kind), 150);
    for (let i = 0; i < 50; i++) c.enqueue("tasks");
    vi.advanceTimersByTime(150);
    expect(fired).toEqual(["tasks"]);
  });

  it("fires once per kind for mixed bursts", () => {
    const fired: string[] = [];
    const c = coalesce<string>((kind) => fired.push(kind), 150);
    c.enqueue("tasks");
    c.enqueue("tags");
    c.enqueue("tasks");
    vi.advanceTimersByTime(150);
    expect(fired.sort()).toEqual(["tags", "tasks"]);
  });

  it("re-arms after a window completes", () => {
    const fired: string[] = [];
    const c = coalesce<string>((kind) => fired.push(kind), 150);
    c.enqueue("tasks");
    vi.advanceTimersByTime(150);
    c.enqueue("tasks");
    vi.advanceTimersByTime(150);
    expect(fired).toEqual(["tasks", "tasks"]);
  });

  it("cancel() clears any pending timer", () => {
    const fired: string[] = [];
    const c = coalesce<string>((kind) => fired.push(kind), 150);
    c.enqueue("tasks");
    c.cancel();
    vi.advanceTimersByTime(300);
    expect(fired).toEqual([]);
  });
});
