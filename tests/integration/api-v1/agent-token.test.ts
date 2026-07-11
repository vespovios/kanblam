import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";
import { GET as getWorkspace } from "@/app/api/v1/workspace/route";
import { POST as postComment } from "@/app/api/v1/tasks/[id]/comments/route";
import { createAgentMember } from "@/lib/agent-members/service";
import { createApiToken } from "@/lib/api-tokens/service";
import { createProject } from "@/lib/projects/service";
import { createTask } from "@/lib/tasks/service";
import { _resetRateLimiter } from "@/lib/api/rate-limit";
import { prisma as appPrisma } from "@/lib/db";

const prisma = new PrismaClient();
let seed: SeededWorkspace;

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
  _resetRateLimiter();
});
afterAll(() => prisma.$disconnect());

const req = (token: string) =>
  new Request("http://localhost/api/v1/workspace", {
    headers: { authorization: `Bearer ${token}` },
  });
const extra = { params: Promise.resolve({}) };

it("agent token authenticates and acts as the agent", async () => {
  const agent = await createAgentMember(seed.workspaceId, { name: "Flight Computer" });
  const { token } = await createApiToken(agent.id, { name: "loop", scopes: ["read", "write"] });
  const res = await getWorkspace(req(token), extra);
  expect(res.status).toBe(200);
});

it("agent token attributes a posted comment to the agent in the DB", async () => {
  const agent = await createAgentMember(seed.workspaceId, { name: "Flight Computer" });
  const { token } = await createApiToken(agent.id, { name: "loop", scopes: ["read", "write"] });

  const project = await createProject(seed.workspaceId, {
    name: "P",
    code: "P",
    statusId: seed.statusIds.inProgress,
  });
  const task = await createTask(seed.workspaceId, {
    projectId: project.id,
    name: "agent-worked task",
    priorityId: seed.priorityIds.medium,
    kanbanStageId: seed.kanbanStageIds.backlog,
  });

  const res = await postComment(
    new Request(`http://localhost/api/v1/tasks/${task!.id}/comments`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ body: "done, see PR #12" }),
    }),
    { params: Promise.resolve({ id: task!.id }) },
  );
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.comment.author.id).toBe(agent.id);

  const row = await appPrisma.comment.findUniqueOrThrow({ where: { id: body.comment.id } });
  expect(row.authorId).toBe(agent.id);
});
