"use client";

import { useRealtimeRefresh } from "./realtime-sync";
import type { Kind } from "@/lib/realtime/kinds";

/**
 * Drop into any server component to make the page refresh on realtime events
 * for the given kinds. Renders nothing.
 */
export function PageRealtimeBridge({ kinds }: { kinds: Kind[] }) {
  useRealtimeRefresh(kinds);
  return null;
}
