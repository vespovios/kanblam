/**
 * Polar product mapping — resolves a hosted tier + billing cadence to the Polar
 * **product id** created in Polar's dashboard.
 *
 * Design rules (per the billing plan, PR 2):
 *
 *   - **Only product ids, no price ids, no per-currency vars.** Polar prices
 *     hang off the product; regional/currency pricing is configured in Polar,
 *     not here. We map tier+cadence → one product id, nothing more.
 *   - **No real ids committed.** Values come from env (deploy secrets); the
 *     committed `.env.example` carries empty placeholder names only.
 *   - **Loud when on, silent when off.** With `BILLING_ENABLED` on, a partial or
 *     missing map is a configuration error and throws. With the flag off (every
 *     self-host install, pre-launch hosted), this is a silent no-op returning
 *     `null` — no env is read, nothing is required.
 *
 * Today there is exactly one hosted tier (`hosted_standard`) with monthly and
 * annual cadences (D4 — exact prices/tiers live in `business/`, never in code).
 * The shape is deliberately small; new tiers/cadences extend `PRODUCT_ENV_VARS`.
 *
 * See `the billing design notes (2026-05-24, private archive)` → PR 2.
 */

import { features } from "@/lib/config/features";

export type BillingTier = "hosted_standard";
export type BillingCadence = "monthly" | "annual";

/** A purchasable plan: one tier at one cadence. */
export interface PlanKey {
  tier: BillingTier;
  cadence: BillingCadence;
}

/**
 * The env var that holds each plan's Polar product id. Adding a tier/cadence is
 * a one-line addition here plus its placeholder in `.env.example`.
 */
const PRODUCT_ENV_VARS: Record<BillingTier, Record<BillingCadence, string>> = {
  hosted_standard: {
    monthly: "POLAR_PRODUCT_HOSTED_STANDARD_MONTHLY",
    annual: "POLAR_PRODUCT_HOSTED_STANDARD_ANNUAL",
  },
};

/** Resolved tier+cadence → product id map. */
export type ProductMap = Record<BillingTier, Record<BillingCadence, string>>;

/**
 * Build the product map from env.
 *
 *   - Billing off ⇒ `null` (silent no-op; no env read, nothing required).
 *   - Billing on  ⇒ every declared env var must be present and non-empty, or a
 *     descriptive `Error` is thrown naming the missing vars. A partial map is
 *     never returned — billing is all-or-nothing configured.
 */
export function loadProductMap(): ProductMap | null {
  if (!features.billingEnabled) return null;

  const missing: string[] = [];
  const map = {} as ProductMap;

  for (const tier of Object.keys(PRODUCT_ENV_VARS) as BillingTier[]) {
    map[tier] = {} as Record<BillingCadence, string>;
    for (const cadence of Object.keys(PRODUCT_ENV_VARS[tier]) as BillingCadence[]) {
      const envVar = PRODUCT_ENV_VARS[tier][cadence];
      const value = process.env[envVar]?.trim();
      if (!value) {
        missing.push(envVar);
        continue;
      }
      map[tier][cadence] = value;
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[billing] BILLING_ENABLED is on but Polar product ids are missing or empty: ` +
        `${missing.join(", ")}. Set every product id in deploy secrets, or turn ` +
        `BILLING_ENABLED off.`,
    );
  }

  return map;
}

/**
 * Resolve a single plan's product id. Returns `null` when billing is off;
 * throws (via `loadProductMap`) on a partial map when billing is on.
 */
export function productIdFor({ tier, cadence }: PlanKey): string | null {
  const map = loadProductMap();
  return map ? map[tier][cadence] : null;
}
