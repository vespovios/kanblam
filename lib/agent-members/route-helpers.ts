import { prisma } from "@/lib/db";

/** The agent must exist in the caller's workspace and be kind AGENT.
 *  Used by the token mint/revoke routes to keep human members
 *  unreachable via this path (indistinguishable 404 from "no such id"). */
export async function agentInWorkspace(workspaceId: string, id: string): Promise<boolean> {
  return (await prisma.user.count({ where: { id, workspaceId, kind: "AGENT" } })) > 0;
}

/** Fresh-role check: JWTs cache role for up to 30 days — minting (and
 *  revoking) long-lived credentials requires current ADMIN, not cached.
 *  Deliberate asymmetry: only the tokens/ routes use this check, since that's
 *  where credentials are issued. The agent CRUD routes intentionally rely on
 *  the session gate alone — creating an agent grants no credentials, and
 *  deleting one cascades its tokens away (fail-safe). */
export async function callerIsCurrentAdmin(userId: string, workspaceId: string): Promise<boolean> {
  return (await prisma.user.count({ where: { id: userId, workspaceId, role: "ADMIN" } })) > 0;
}
