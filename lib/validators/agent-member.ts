import { z } from "zod";

/** Reserved domain for agent users' synthetic emails — never displayed, never mailed. */
export const AGENT_EMAIL_DOMAIN = "agents.internal";

/** Default per-workspace agent cap; self-hosters may raise via AGENT_MEMBERS_MAX. */
export const AGENT_MEMBERS_DEFAULT_MAX = 5;

export function agentMembersMax(): number {
  const n = Number.parseInt(process.env.AGENT_MEMBERS_MAX ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : AGENT_MEMBERS_DEFAULT_MAX;
}

export const createAgentMemberSchema = z.object({
  name: z.string().trim().min(1, "Agent name is required").max(100),
});

export type CreateAgentMemberInput = z.infer<typeof createAgentMemberSchema>;

/** Rename takes the same single field. */
export const renameAgentMemberSchema = createAgentMemberSchema;
export type RenameAgentMemberInput = CreateAgentMemberInput;
