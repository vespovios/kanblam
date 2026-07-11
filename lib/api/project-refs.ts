import { prisma } from "@/lib/db";
import { ApiError } from "./errors";

/** The Project FKs (statusId, projectLeadId) reference globally-unique ids,
 *  so the DB alone can't stop a cross-tenant reference. The app's UI only
 *  ever offers same-workspace options; the public API must check
 *  explicitly. 404-shaped (not 403) — foreign ids must be
 *  indistinguishable from nonexistent ones. */
export async function assertProjectRefsInWorkspace(
  workspaceId: string,
  input: { statusId?: string; projectLeadId?: string | null },
): Promise<void> {
  if (input.statusId) {
    const ok = await prisma.status.count({ where: { id: input.statusId, workspaceId } });
    if (ok === 0) throw new ApiError("not_found", "Status not found.");
  }
  if (input.projectLeadId) {
    const ok = await prisma.user.count({ where: { id: input.projectLeadId, workspaceId } });
    if (ok === 0) throw new ApiError("not_found", "Project lead not found.");
  }
}
