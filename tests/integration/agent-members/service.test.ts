import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";
import {
  createAgentMember,
  renameAgentMember,
  removeAgentMember,
} from "@/lib/agent-members/service";
import { createApiToken } from "@/lib/api-tokens/service";

const prisma = new PrismaClient();
let seed: SeededWorkspace;

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
  delete process.env.AGENT_MEMBERS_MAX;
});
afterAll(() => prisma.$disconnect());

describe("createAgentMember", () => {
  // Local hygiene: don't leak the cap override into other tests/files.
  afterEach(() => {
    delete process.env.AGENT_MEMBERS_MAX;
  });

  it("creates AGENT/MEMBER with synthetic internal email and no password", async () => {
    const agent = await createAgentMember(seed.workspaceId, { name: "Flight Computer" });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: agent.id } });
    expect(row.kind).toBe("AGENT");
    expect(row.role).toBe("MEMBER");
    expect(row.name).toBe("Flight Computer");
    expect(row.email).toMatch(/^agent-[0-9a-f-]+@agents\.internal$/);
    expect(row.passwordHash).toBeNull(); // login guard precondition (lib/auth/config.ts)
  });

  it("enforces the cap (default 5) and the env override", async () => {
    for (let i = 0; i < 5; i++) {
      await createAgentMember(seed.workspaceId, { name: `A${i}` });
    }
    await expect(createAgentMember(seed.workspaceId, { name: "six" })).rejects.toThrow(
      /limit/i,
    );
    process.env.AGENT_MEMBERS_MAX = "6";
    const sixth = await createAgentMember(seed.workspaceId, { name: "six" });
    expect(sixth.id).toBeTruthy();
  });
});

describe("renameAgentMember", () => {
  it("renames only agents in the same workspace", async () => {
    const agent = await createAgentMember(seed.workspaceId, { name: "Old" });
    expect(await renameAgentMember(seed.workspaceId, agent.id, { name: "New" })).toBe(true);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: agent.id } });
    expect(row.name).toBe("New");
    // Humans are untouchable through this service:
    expect(await renameAgentMember(seed.workspaceId, seed.memberId, { name: "X" })).toBe(false);
  });
});

describe("removeAgentMember", () => {
  it("deletes the agent, cascades its tokens, SetNulls its comments/assignments", async () => {
    const agent = await createAgentMember(seed.workspaceId, { name: "Doomed" });
    await createApiToken(agent.id, { name: "t", scopes: ["read"] });
    const project = await prisma.project.create({
      data: {
        workspaceId: seed.workspaceId,
        name: "P",
        code: "P01",
        statusId: seed.statusIds.notStarted,
      },
    });
    const task = await prisma.task.create({
      data: {
        workspaceId: seed.workspaceId,
        projectId: project.id,
        name: "T",
        priorityId: seed.priorityIds.medium,
        kanbanStageId: seed.kanbanStageIds.backlog,
        assigneeId: agent.id,
      },
    });
    const comment = await prisma.comment.create({
      data: { workspaceId: seed.workspaceId, taskId: task.id, authorId: agent.id, body: "hi" },
    });

    expect(await removeAgentMember(seed.workspaceId, agent.id)).toBe(true);
    expect(await prisma.user.count({ where: { id: agent.id } })).toBe(0);
    expect(await prisma.apiToken.count({ where: { userId: agent.id } })).toBe(0);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).assigneeId).toBeNull();
    expect((await prisma.comment.findUniqueOrThrow({ where: { id: comment.id } })).authorId).toBeNull();
  });

  it("refuses humans and cross-workspace ids", async () => {
    expect(await removeAgentMember(seed.workspaceId, seed.memberId)).toBe(false);
    expect(await prisma.user.count({ where: { id: seed.memberId } })).toBe(1);

    // Cross-workspace: an agent in workspace A is unreachable via workspace B.
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    const agent = await createAgentMember(seed.workspaceId, { name: "Homed" });
    expect(await removeAgentMember(other.id, agent.id)).toBe(false);
    expect(await prisma.user.count({ where: { id: agent.id } })).toBe(1);
    expect(await renameAgentMember(other.id, agent.id, { name: "X" })).toBe(false);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: agent.id } });
    expect(row.name).toBe("Homed");
  });
});
