// Agent members: workspace users flagged kind=AGENT. They cannot log in
// (passwordHash null — lib/auth/config.ts rejects), cannot be invited, and
// hold ordinary ApiTokens so /api/v1 attribution just works.
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import {
  AGENT_EMAIL_DOMAIN,
  agentMembersMax,
  type CreateAgentMemberInput,
  type RenameAgentMemberInput,
} from "@/lib/validators/agent-member";

const AGENT_SELECT = {
  id: true,
  name: true,
  kind: true,
  role: true,
  createdAt: true,
} as const;

export async function createAgentMember(
  workspaceId: string,
  input: CreateAgentMemberInput,
) {
  const max = agentMembersMax();
  const count = await prisma.user.count({ where: { workspaceId, kind: "AGENT" } });
  if (count >= max) {
    throw new Error(`Agent member limit reached (${max}).`);
  }
  return prisma.user.create({
    data: {
      workspaceId,
      kind: "AGENT",
      role: "MEMBER",
      name: input.name,
      // Synthetic address satisfying @@unique([workspaceId, email]); never shown.
      email: `agent-${randomUUID()}@${AGENT_EMAIL_DOMAIN}`,
      passwordHash: null,
    },
    select: AGENT_SELECT,
  });
}

export async function renameAgentMember(
  workspaceId: string,
  agentId: string,
  input: RenameAgentMemberInput,
): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: { id: agentId, workspaceId, kind: "AGENT" },
    data: { name: input.name },
  });
  return count > 0;
}

/**
 * Deletes the agent user. FK actions do the rest: ApiToken Cascade;
 * Task.assignee / Project.projectLead / Comment.author SetNull.
 * kind: "AGENT" in the where-clause makes humans unreachable here.
 */
export async function removeAgentMember(
  workspaceId: string,
  agentId: string,
): Promise<boolean> {
  const { count } = await prisma.user.deleteMany({
    where: { id: agentId, workspaceId, kind: "AGENT" },
  });
  return count > 0;
}
