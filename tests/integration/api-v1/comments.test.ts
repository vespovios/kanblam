import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";
import { createApiToken } from "@/lib/api-tokens/service";
import { createProject } from "@/lib/projects/service";
import { createTask } from "@/lib/tasks/service";
import { _resetRateLimiter } from "@/lib/api/rate-limit";
import { GET as listComments, POST as postComment } from "@/app/api/v1/tasks/[id]/comments/route";
import { DELETE as deleteComment } from "@/app/api/v1/comments/[id]/route";

const prisma = new PrismaClient();
let seed: SeededWorkspace;
let adminToken: string;
let memberToken: string;
let taskId: string;

function req(token: string, method: string, url: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined && { "content-type": "application/json" }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}
const withId = (id: string) => ({ params: Promise.resolve({ id }) });
const url = (tid: string) => `http://localhost/api/v1/tasks/${tid}/comments`;
const curl = (cid: string) => `http://localhost/api/v1/comments/${cid}`;

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
  _resetRateLimiter();
  adminToken = (await createApiToken(seed.adminId, { name: "a", scopes: ["read", "write"] })).token;
  memberToken = (await createApiToken(seed.memberId, { name: "m", scopes: ["read", "write"] })).token;
  const project = await createProject(seed.workspaceId, {
    name: "P",
    code: "P",
    statusId: seed.statusIds.inProgress,
  });
  const task = await createTask(seed.workspaceId, {
    projectId: project.id,
    name: "commented task",
    priorityId: seed.priorityIds.medium,
    kanbanStageId: seed.kanbanStageIds.backlog,
  });
  taskId = task!.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("comments over the API", () => {
  it("post → list chronologically with author identity", async () => {
    const r1 = await postComment(
      req(memberToken, "POST", url(taskId), { body: "starting on this" }),
      withId(taskId),
    );
    expect(r1.status).toBe(201);
    await postComment(
      req(memberToken, "POST", url(taskId), { body: "blocked on the antenna analyser" }),
      withId(taskId),
    );

    const listed = await (await listComments(req(adminToken, "GET", url(taskId)), withId(taskId))).json();
    expect(listed.comments.length).toBe(2);
    expect(listed.comments[0].body).toBe("starting on this");
    expect(listed.comments[0].author.id).toBe(seed.memberId);
    expect(typeof listed.comments[0].createdAt).toBe("string");
    // author object is whitelisted — id + name only (never email or kind)
    expect(Object.keys(listed.comments[0].author).sort()).toEqual(["id", "name"]);
  });

  it("empty and over-long bodies 422", async () => {
    const empty = await postComment(req(memberToken, "POST", url(taskId), { body: "  " }), withId(taskId));
    expect(empty.status).toBe(422);
    const long = await postComment(
      req(memberToken, "POST", url(taskId), { body: "x".repeat(10_001) }),
      withId(taskId),
    );
    expect(long.status).toBe(422);
  });

  it("members delete their own but not others'; admins moderate", async () => {
    const mine = await (
      await postComment(req(memberToken, "POST", url(taskId), { body: "mine" }), withId(taskId))
    ).json();
    const theirs = await (
      await postComment(req(adminToken, "POST", url(taskId), { body: "admin's" }), withId(taskId))
    ).json();

    // member cannot delete the admin's comment — 404, no existence leak
    const denied = await deleteComment(
      req(memberToken, "DELETE", curl(theirs.comment.id)),
      withId(theirs.comment.id),
    );
    expect(denied.status).toBe(404);

    // member deletes own
    const own = await deleteComment(
      req(memberToken, "DELETE", curl(mine.comment.id)),
      withId(mine.comment.id),
    );
    expect(own.status).toBe(200);

    // admin moderates the remaining member comment
    const again = await (
      await postComment(req(memberToken, "POST", url(taskId), { body: "again" }), withId(taskId))
    ).json();
    const moderated = await deleteComment(
      req(adminToken, "DELETE", curl(again.comment.id)),
      withId(again.comment.id),
    );
    expect(moderated.status).toBe(200);
  });

  it("comments vanish with their task (cascade) and survive author deletion", async () => {
    const c = await (
      await postComment(req(memberToken, "POST", url(taskId), { body: "orphan-to-be" }), withId(taskId))
    ).json();

    await prisma.user.delete({ where: { id: seed.memberId } });
    const afterAuthorGone = await prisma.comment.findUnique({ where: { id: c.comment.id } });
    expect(afterAuthorGone).not.toBeNull();
    expect(afterAuthorGone!.authorId).toBeNull();

    await prisma.task.delete({ where: { id: taskId } });
    const afterTaskGone = await prisma.comment.count({ where: { taskId } });
    expect(afterTaskGone).toBe(0);
  });
});
