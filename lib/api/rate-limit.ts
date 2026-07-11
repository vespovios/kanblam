/**
 * Per-token sliding-window rate limiter for /api/v1. In-memory by design —
 * single-box architecture (see ARCHITECTURE.md); resets on restart, which
 * is acceptable. Limit is env-tunable mostly so tests can drop it low.
 */

const WINDOW_MS = 60_000;

const hits = new Map<string, number[]>();

function limitPerMinute(): number {
  const n = Number(process.env.API_RATE_LIMIT_PER_MIN);
  return Number.isFinite(n) && n > 0 ? n : 120;
}

export interface RateResult {
  allowed: boolean;
  /** Seconds until a slot frees up — only meaningful when !allowed. */
  retryAfterSec: number;
}

export function checkRateLimit(tokenId: string): RateResult {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const recent = (hits.get(tokenId) ?? []).filter((t) => t > windowStart);

  if (recent.length >= limitPerMinute()) {
    hits.set(tokenId, recent);
    const oldest = recent[0];
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((oldest - windowStart) / 1000)) };
  }

  recent.push(now);
  hits.set(tokenId, recent);

  // Opportunistic sweep so the map can't grow unbounded.
  if (hits.size > 10_000) {
    for (const [k, v] of hits) {
      if (v.every((t) => t <= windowStart)) hits.delete(k);
    }
  }
  return { allowed: true, retryAfterSec: 0 };
}

/** Test hook — clears all counters. */
export function _resetRateLimiter(): void {
  hits.clear();
}
