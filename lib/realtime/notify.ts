import { prisma } from "@/lib/db";
import { WORKSPACE_CHANNEL } from "./kinds";
import type { Kind } from "./kinds";

/**
 * Broadcast a workspace-scoped change. Wraps Postgres NOTIFY in a try/catch so
 * a transient PG hiccup never fails the user-facing mutation that called us —
 * other tabs will catch up on their next interaction.
 *
 * Single quotes in the payload (e.g. workspaceIds with apostrophes — defensive,
 * shouldn't happen in practice) are escaped by doubling.
 */
export async function notifyWorkspace(workspaceId: string, kind: Kind): Promise<void> {
  const payload = JSON.stringify({ workspaceId, kind });
  const escaped = payload.replace(/'/g, "''");
  try {
    await prisma.$executeRawUnsafe(`NOTIFY ${WORKSPACE_CHANNEL}, '${escaped}'`);
  } catch (err) {
    console.warn(`[realtime] notify failed (${workspaceId}, ${kind})`, err);
  }
}
