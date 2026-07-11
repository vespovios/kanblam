/**
 * Per-key debounced fan-in. enqueue(k) starts a timer for k (or extends an
 * existing one); after windowMs of quiet for that key, the callback fires
 * once for that key. Pure / unit-testable.
 */
export function coalesce<K extends string>(fire: (key: K) => void, windowMs: number) {
  const timers = new Map<K, ReturnType<typeof setTimeout>>();
  return {
    enqueue(key: K) {
      const existing = timers.get(key);
      if (existing) clearTimeout(existing);
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          fire(key);
        }, windowMs),
      );
    },
    cancel() {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
  };
}
