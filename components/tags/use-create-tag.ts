"use client";

import { useCallback } from "react";
import type { TagLite } from "./tag-pill";

export type CreatedTag = TagLite & { _count: { tasks: number } };

export function useCreateTag() {
  return useCallback(async (name: string): Promise<CreatedTag | null> => {
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return null;
    const { tag } = await res.json();
    return { ...tag, _count: { tasks: 0 } };
  }, []);
}
