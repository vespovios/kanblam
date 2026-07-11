/**
 * Polar.sh client — the single, lazily-constructed entry point to Polar's API.
 *
 * Everything here is **flag-gated and fail-safe**:
 *
 *   - When `features.billingEnabled` is false (the default on every self-host
 *     install and pre-launch hosted deploy), the client is **never constructed**
 *     and `getPolarClient()` returns `null`. No token is read, no network stack
 *     is touched. This upholds the self-host invariant: billing is a hard no-op.
 *   - When the flag is on but `POLAR_ACCESS_TOKEN` is unset, the client is still
 *     `null` — missing the token disables billing even with the flag flipped
 *     (fail safe). We log **once** so a misconfigured deploy is noticed without
 *     spamming the logs on every request.
 *   - The server environment defaults to Polar's **production** API
 *     (`api.polar.sh`). Polar's current model is test/live *by token*: a
 *     test-mode token authenticates against the same production API, so
 *     test-mode billing runs with `server: "production"`. The legacy isolated
 *     `sandbox-api.polar.sh` host is opt-in only, via `POLAR_ENV=sandbox`.
 *
 * The client is memoised after first successful construction. No real token,
 * product id, or secret is ever committed; values come from deploy secrets.
 *
 * See `the billing design notes (2026-05-24, private archive)` → PR 2.
 */

import { Polar } from "@polar-sh/sdk";
import { features } from "@/lib/config/features";

/** Polar's two isolated environments — separate data, tokens, and customers. */
export type PolarServer = "sandbox" | "production";

/**
 * Resolve the Polar server from env. Defaults to `production` (`api.polar.sh`),
 * where both live and test-mode tokens authenticate under Polar's current
 * test/live-by-token model. The legacy isolated `sandbox` host is opt-in only,
 * selected by the explicit literal `POLAR_ENV=sandbox`; anything else (unset,
 * empty, or a typo) resolves to `production`.
 */
export function polarServer(): PolarServer {
  return process.env.POLAR_ENV === "sandbox" ? "sandbox" : "production";
}

// Memoised singleton. `undefined` = not yet resolved; `null` = resolved to "no
// client" (billing off or unconfigured). Distinguishing the two lets us log the
// "unconfigured" warning exactly once.
let cached: Polar | null | undefined;
let warned = false;

/**
 * Get the shared Polar client, or `null` when billing is disabled or
 * unconfigured. Lazy: the client is built on first call and only when both the
 * flag is on and a token is present.
 */
export function getPolarClient(): Polar | null {
  if (cached !== undefined) return cached;

  // Self-host invariant: never construct a client when billing is off.
  if (!features.billingEnabled) {
    cached = null;
    return cached;
  }

  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) {
    if (!warned) {
      console.warn(
        "[billing] BILLING_ENABLED is on but POLAR_ACCESS_TOKEN is unset — " +
          "billing stays disabled (fail safe). Set the token in deploy secrets.",
      );
      warned = true;
    }
    cached = null;
    return cached;
  }

  cached = new Polar({ accessToken, server: polarServer() });
  return cached;
}

/**
 * Reset the memoised client and warn-once latch. **Test-only** — production code
 * should treat the client as a process-lifetime singleton.
 */
export function __resetPolarClientForTests(): void {
  cached = undefined;
  warned = false;
}
