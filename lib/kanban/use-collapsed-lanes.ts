"use client";

import { useCallback, useEffect, useState } from "react";
import type { LaneAxis } from "./lanes";

const STORAGE_KEY = "kanblam-collapsed-lanes-v1";

/** Persisted shape: collapsed lane ids bucketed per axis. */
type Stored = Partial<Record<LaneAxis, string[]>>;

function read(): Stored {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    return {};
  }
}

function write(stored: Stored): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // localStorage can be unavailable (private mode / quota) — collapse
    // state just won't persist, which is an acceptable degradation.
  }
}

/**
 * Per-axis collapsed-swimlane state, persisted to localStorage so a
 * collapsed lane stays collapsed across global-filter changes (which
 * remount <KanbanBoard> via its `key`), navigation, and reloads.
 *
 * Keyed by axis so collapsing assignee lanes doesn't bleed into the
 * tag or project lane sets — each axis has its own collapsed set.
 *
 * First render is always empty (server + client agree); a mount
 * effect then hydrates from localStorage. The brief flash of an
 * expanded lane before it collapses is acceptable and matches the
 * mounted-gate pattern used elsewhere (e.g. <ThemeToggle>).
 */
export function useCollapsedLanes(axis: LaneAxis) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCollapsed(new Set(read()[axis] ?? []));
  }, [axis]);

  const toggle = useCallback(
    (laneId: string) => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(laneId)) next.delete(laneId);
        else next.add(laneId);
        const stored = read();
        stored[axis] = [...next];
        write(stored);
        return next;
      });
    },
    [axis],
  );

  return { collapsed, toggle };
}
