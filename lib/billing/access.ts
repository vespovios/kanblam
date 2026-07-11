/**
 * Server-side workspace access resolution — the IO companion to the pure
 * `workspaceAccessLevel` truth table in `@/lib/billing/entitlements`.
 *
 * Reads the workspace's billing snapshot and returns its access level for
 * request-time UI decisions (the app-wide read-only banner, disabled mutation
 * controls). The write-path enforcement seam (`requireWritableWorkspace`) does
 * its own read; this helper is for read-only render paths that need the level.
 *
 * **Self-host invariant:** when `features.billingEnabled` is false this returns
 * `"full"` without ever touching the database — billing is a hard no-op.
 */

import { prisma } from "@/lib/db";
import { features } from "@/lib/config/features";
import {
  workspaceAccessLevel,
  type WorkspaceAccessLevel,
} from "@/lib/billing/entitlements";

/**
 * The public app origin (e.g. `https://kanblam.com`) used to build Polar
 * success / cancel / portal-return URLs. Returns `null` when `APP_URL` is unset
 * or blank, so billing routes can fail **loudly** (503) instead of silently
 * redirecting customers to `http://localhost:3000` on a misconfigured deploy.
 */
export function loadAppUrl(): string | null {
  const appUrl = process.env.APP_URL;
  return appUrl && appUrl.length > 0 ? appUrl : null;
}

export async function getWorkspaceAccessLevel(
  workspaceId: string,
): Promise<WorkspaceAccessLevel> {
  // Billing off (self-host / pre-launch): always full, no DB read.
  if (!features.billingEnabled) return "full";

  const billing = await prisma.workspaceBilling.findUnique({
    where: { workspaceId },
    select: { status: true, currentPeriodEnd: true },
  });

  return workspaceAccessLevel(billing);
}
