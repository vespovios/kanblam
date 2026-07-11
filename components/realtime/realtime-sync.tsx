"use client";

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Kind } from "@/lib/realtime/kinds";
import { coalesce } from "@/lib/realtime/coalesce";

const DEBOUNCE_MS = 150;

type Subscribers = Map<Kind, Set<() => void>>;

const ContextRef = createContext<{
  subscribe: (kinds: Kind[], cb: () => void) => () => void;
} | null>(null);

export function RealtimeSync({ children }: { children: ReactNode }) {
  const subscribersRef = useRef<Subscribers>(new Map());

  // Stable per-kind dispatcher: when a kind fires (post-debounce), call every
  // subscriber registered for that kind. Subscribers can choose to call
  // router.refresh themselves (the default useRealtimeRefresh hook does so).
  const debounce = useMemo(
    () =>
      coalesce<Kind>((kind) => {
        const set = subscribersRef.current.get(kind);
        if (!set) return;
        for (const cb of set) cb();
      }, DEBOUNCE_MS),
    [],
  );

  useEffect(() => {
    let firstErrorLogged = false;
    const es = new EventSource("/api/realtime");
    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as { kind: Kind };
        debounce.enqueue(parsed.kind);
      } catch {
        // malformed event — ignore
      }
    };
    es.onerror = (e) => {
      if (!firstErrorLogged) {
        firstErrorLogged = true;
        console.warn("[realtime] EventSource error; native auto-reconnect will retry", e);
      }
      // EventSource auto-reconnects; no manual recovery needed.
    };
    return () => {
      es.close();
      debounce.cancel();
    };
  }, [debounce]);

  const value = useMemo(
    () => ({
      subscribe: (kinds: Kind[], cb: () => void) => {
        const subs = subscribersRef.current;
        for (const k of kinds) {
          const set = subs.get(k) ?? new Set<() => void>();
          set.add(cb);
          subs.set(k, set);
        }
        return () => {
          for (const k of kinds) {
            const set = subs.get(k);
            if (!set) continue;
            set.delete(cb);
            if (set.size === 0) subs.delete(k);
          }
        };
      },
    }),
    [],
  );

  return <ContextRef.Provider value={value}>{children}</ContextRef.Provider>;
}

export function useRealtimeRefresh(kinds: Kind[]): void {
  const ctx = useContext(ContextRef);
  const router = useRouter();
  useEffect(() => {
    if (!ctx) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[realtime] useRealtimeRefresh called outside <RealtimeSync>; events will not refresh this surface.",
        );
      }
      return;
    }
    return ctx.subscribe(kinds, () => router.refresh());
    // kinds is referentially unstable — stringify into a stable key. The hook
    // contract is that `kinds` is a static literal at the callsite, so the
    // join is a deterministic identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, kinds.join("|"), router]);
}
