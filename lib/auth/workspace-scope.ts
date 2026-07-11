import { auth } from "@/auth";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { features } from "@/lib/config/features";
import { workspaceAccessLevel } from "@/lib/billing/entitlements";

export interface WorkspaceContext {
  userId: string;
  workspaceId: string;
  role: UserRole;
}

export class WorkspaceAuthError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "WorkspaceAuthError";
    this.status = status;
  }
}

/**
 * Returns the caller's {userId, workspaceId, role} or throws WorkspaceAuthError.
 * All API route handlers that touch domain data must go through this.
 */
export async function requireWorkspaceContext(): Promise<WorkspaceContext> {
  const session = await auth();
  const user = session?.user as
    | { id?: string; workspaceId?: string; role?: UserRole }
    | undefined;

  if (!user?.id || !user?.workspaceId || !user?.role) {
    throw new WorkspaceAuthError("Unauthorized", 401);
  }

  return {
    userId: user.id,
    workspaceId: user.workspaceId,
    role: user.role,
  };
}

/**
 * Same as `requireWorkspaceContext` but also asserts the caller has ADMIN role.
 * Use on API routes that administer workspace-wide settings (holidays,
 * working days, member invites, etc.).
 */
export async function requireAdminContext(): Promise<WorkspaceContext> {
  const ctx = await requireWorkspaceContext();
  if (ctx.role !== "ADMIN") {
    throw new WorkspaceAuthError("Forbidden", 403);
  }
  return ctx;
}

/**
 * Assert a workspace is **writable** under its billing entitlement, or throw
 * `WorkspaceAuthError(402)`. The low-level building block behind
 * `requireWritableWorkspace`; exported for the few mutating routes that do their
 * own inline auth (e.g. the invite routes) and so can't use the wrapper above.
 *
 * **Self-host invariant:** when `features.billingEnabled` is false this is a
 * pure pass-through — it never touches the database. Reads are never gated;
 * entitlement gates workspace lifecycle, never feature access.
 */
export async function assertWorkspaceWritable(workspaceId: string): Promise<void> {
  // Billing off (self-host / pre-launch): pass-through, no DB read.
  if (!features.billingEnabled) return;

  const billing = await prisma.workspaceBilling.findUnique({
    where: { workspaceId },
    select: { status: true, currentPeriodEnd: true },
  });

  if (workspaceAccessLevel(billing) !== "full") {
    throw new WorkspaceAuthError(
      "Workspace is read-only — subscription required",
      402,
    );
  }
}

/**
 * Same as `requireWorkspaceContext` but also asserts the caller's workspace is
 * **writable** under its billing entitlement. Use on mutating API routes; reads
 * are never gated. Pass `{ admin: true }` for mutations that also require ADMIN
 * (reuses `requireAdminContext`, so the 403 fires before the 402).
 *
 * Additive by design — it does not change the signatures of the context
 * functions above.
 *
 * **Self-host invariant:** when `features.billingEnabled` is false this is a
 * pure pass-through — it returns the context without ever touching the database.
 * When billing is on, a non-`"full"` access level throws
 * `WorkspaceAuthError(402)` so the caller can surface a "subscription required"
 * response.
 */
export async function requireWritableWorkspace(
  opts?: { admin?: boolean },
): Promise<WorkspaceContext> {
  const ctx = opts?.admin
    ? await requireAdminContext()
    : await requireWorkspaceContext();

  await assertWorkspaceWritable(ctx.workspaceId);
  return ctx;
}

/**
 * Convenience: wraps the given handler, converting WorkspaceAuthError into
 * a JSON Response with the error's status.
 */
export async function withWorkspace<T>(
  handler: (ctx: WorkspaceContext) => Promise<T>,
): Promise<T | Response> {
  try {
    const ctx = await requireWorkspaceContext();
    return await handler(ctx);
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw err;
  }
}
