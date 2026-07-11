/**
 * Feature flags — single source of truth for env-driven on/off behaviour.
 *
 * The flags exist to support two deployment modes from one codebase:
 *
 *   - **SaaS** (kanblam.com on the Contabo VPS): marketing landing,
 *     waitlist signup, eventually billing.
 *   - **Self-host** (OSS users on PikaPods, ZimaOS, Raspberry Pi, etc.):
 *     no marketing landing, no waitlist, just the app and a sensible
 *     landing redirect to /login.
 *
 * Self-hosters set the OSS flags in their `.env.prod`:
 *
 *     LANDING_MODE=app
 *     WAITLIST_ENABLED=false
 *
 * SaaS leaves them at their default (or sets them explicitly):
 *
 *     LANDING_MODE=marketing
 *     WAITLIST_ENABLED=true
 *
 * To check a flag from anywhere in the codebase:
 *
 *     import { features } from "@/lib/config/features";
 *     if (features.waitlistEnabled) { ... }
 *
 * Server components read this at request time. Client components must
 * receive the value via props (env vars aren't accessible in the browser
 * unless prefixed `NEXT_PUBLIC_`).
 */

function bool(envVar: string | undefined, defaultValue: boolean): boolean {
  if (envVar === undefined || envVar === "") return defaultValue;
  return envVar === "true" || envVar === "1";
}

type LandingMode = "marketing" | "app";

function landingMode(envVar: string | undefined, defaultValue: LandingMode): LandingMode {
  if (envVar === "marketing" || envVar === "app") return envVar;
  return defaultValue;
}

export const features = {
  /** Controls what `/` shows for logged-out visitors.
   *  - `marketing` (default): the SaaS landing page with waitlist form.
   *  - `app`: redirect logged-out visitors straight to `/login`. The
   *    appropriate setting for self-hosters who don't run a public-facing
   *    marketing site. */
  landingMode: landingMode(process.env.LANDING_MODE, "marketing"),

  /** Gates `POST /api/waitlist` and the waitlist form on the landing page.
   *  When false the route returns 404; the form is hidden client-side.
   *  Default true on the SaaS deploy, set false in self-host `.env`. */
  waitlistEnabled: bool(process.env.WAITLIST_ENABLED, true),

  /** Future: gates Polar.sh billing integration. Off by default (no billing
   *  code paths shipped yet). Reserved so callsites can be added now and
   *  flip behaviour later without a code change. */
  billingEnabled: bool(process.env.BILLING_ENABLED, false),
} as const;

export type Features = typeof features;
