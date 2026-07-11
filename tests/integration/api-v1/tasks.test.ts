import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";
import { createApiToken } from "@/lib/api-tokens/service";
import { createProject } from "@/lib/projects/service";
import { _resetRateLimiter } from "@/lib/api/rate-limit";
import { GET as listTasks, POST as postTask } from "@/app/api/v1/tasks/route";
import { GET as getTask, PATCH as patchTask, DELETE as deleteTask } from "@/app/api/v1/tasks/[id]/route";
import { POST as moveTask } from "@/app/api/v1/tasks/[id]/move/route";
import { GET as listSubtasks, POST as postSubtask } from "@/app/api/v1/tasks/[id]/subtasks/route";
import { PATCH as patchSubtask } from "@/app/api/v1/subtasks/[id]/route";

const prisma = new PrismaClient();
let seed: SeededWorkspace;
let token: string;
let projectId: string;

const BASE = "http://localhost/api/v1/tasks";

function req(method: string, url: string, body?: unknown) {
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
const noId = { params: Promise.resolve({}) };

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
  _resetRateLimiter();
  token = (await createApiToken(seed.adminId, { name: "t", scopes: ["read", "write"] })).token;
  const project = await createProject(seed.workspaceId, {
    name: "Payload",
    code: "PAY",
    statusId: seed.statusIds.inProgress,
  });
  projectId = project.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function mkTask(name: string, extra: Record<string, unknown> = {}) {
  const res = await postTask(req("POST", BASE, { projectId, name, ...extra }), noId);
  expect(res.status).toBe(201);
  return (await res.json()).task;
}

describe("POST /api/v1/tasks", () => {
  it("creates with ergonomic defaults: medium priority, first stage, caller assigned", async () => {
    const task = await mkTask("Tune the dipole");
    expect(task.priority.name).toBe("Medium");
    expect(task.stage.name).toBe("Backlog");
    expect(task.assignee.id).toBe(seed.adminId);
    expect(task.quadrant).toBe("q4");
  });

  it("respects explicit fields and returns the serialized contract shape", async () => {
    const task = await mkTask("Cold soak", {
      priorityId: seed.priorityIds.high,
      kanbanStageId: seed.kanbanStageIds.inProgress,
      isImportant: true,
      isUrgent: true,
      dueDate: "2026-08-01",
      tagIds: [],
      subtasks: [{ title: "dry ice" }, { title: "telemetry on" }],
    });
    expect(task.quadrant).toBe("q1");
    expect(task.dueDate).toBe("2026-08-01");
    expect(task.subtasks.length).toBe(2);
    expect(task.recurring).toBe(false);
    // assignee never exposes an email
    expect(Object.keys(task.assignee).sort()).toEqual(["id", "name"]);
  });

  it("422 on validation failure, 404 on foreign project", async () => {
    const bad = await postTask(req("POST", BASE, { projectId, name: "" }), noId);
    expect(bad.status).toBe(422);
    expect((await bad.json()).error.code).toBe("invalid_request");

    const other = await prisma.workspace.create({ data: { name: "Other" } });
    const foreignStatus = await prisma.status.create({
      data: { workspaceId: other.id, name: "S", color: "#000", order: 1 },
    });
    const foreignProject = await createProject(other.id, {
      name: "Foreign",
      code: "FOR",
      statusId: foreignStatus.id,
    });
    const res = await postTask(req("POST", BASE, { projectId: foreignProject.id, name: "sneaky" }), noId);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/tasks", () => {
  it("filters by stage and free text", async () => {
    await mkTask("alpha antenna");
    await mkTask("beta balloon", { kanbanStageId: seed.kanbanStageIds.inProgress });

    const byStage = await (
      await listTasks(req("GET", `${BASE}?stageId=${seed.kanbanStageIds.inProgress}`), noId)
    ).json();
    expect(byStage.tasks.map((t: { name: string }) => t.name)).toEqual(["beta balloon"]);

    const byText = await (await listTasks(req("GET", `${BASE}?q=antenna`), noId)).json();
    expect(byText.tasks.map((t: { name: string }) => t.name)).toEqual(["alpha antenna"]);
  });

  it("paginates with a cursor and terminates", async () => {
    for (let i = 0; i < 5; i++) await mkTask(`task ${i}`);
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page++) {
      const url: string = `${BASE}?limit=2${cursor ? `&cursor=${cursor}` : ""}`;
      const body: { tasks: { id: string }[]; nextCursor: string | null } = await (
        await listTasks(req("GET", url), noId)
      ).json();
      seen.push(...body.tasks.map((t: { id: string }) => t.id));
      cursor = body.nextCursor;
      if (!cursor) break;
    }
    expect(seen.length).toBe(5);
    expect(new Set(seen).size).toBe(5); // no duplicates across pages
  });

  it("rejects an unknown cursor", async () => {
    const res = await listTasks(req("GET", `${BASE}?cursor=nonexistent`), noId);
    expect(res.status).toBe(422);
  });
});

describe("task detail / update / move / delete", () => {
  it("full lifecycle", async () => {
    const task = await mkTask("lifecycle");

    const got = await (await getTask(req("GET", `${BASE}/${task.id}`), withId(task.id))).json();
    expect(got.task.name).toBe("lifecycle");

    const patched = await (
      await patchTask(
        req("PATCH", `${BASE}/${task.id}`, { name: "renamed", isImportant: true }),
        withId(task.id),
      )
    ).json();
    expect(patched.task.name).toBe("renamed");
    expect(patched.task.quadrant).toBe("q2");

    const moved = await (
      await moveTask(
        req("POST", `${BASE}/${task.id}/move`, { kanbanStageId: seed.kanbanStageIds.done }),
        withId(task.id),
      )
    ).json();
    expect(moved.task.stage.isTerminal).toBe(true);

    const del = await deleteTask(req("DELETE", `${BASE}/${task.id}`), withId(task.id));
    expect(del.status).toBe(200);
    expect((await getTask(req("GET", `${BASE}/${task.id}`), withId(task.id))).status).toBe(404);
  });

  it("cross-workspace ids 404 exactly like unknown ids", async () => {
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    const stage = await prisma.kanbanStage.create({
      data: { workspaceId: other.id, name: "S", color: "#000", order: 1, isTerminal: false },
    });
    const prio = await prisma.priority.create({
      data: { workspaceId: other.id, name: "P", color: "#000", order: 1 },
    });
    const status = await prisma.status.create({
      data: { workspaceId: other.id, name: "St", color: "#000", order: 1 },
    });
    const proj = await prisma.project.create({
      data: { workspaceId: other.id, name: "F", code: "F", statusId: status.id },
    });
    const foreign = await prisma.task.create({
      data: {
        workspaceId: other.id,
        projectId: proj.id,
        name: "foreign",
        priorityId: prio.id,
        kanbanStageId: stage.id,
      },
    });

    const asUnknown = await getTask(req("GET", `${BASE}/${foreign.id}`), withId(foreign.id));
    const asMissing = await getTask(req("GET", `${BASE}/nope`), withId("nope"));
    expect(asUnknown.status).toBe(404);
    expect(asMissing.status).toBe(404);
    expect(await asUnknown.json()).toEqual(await asMissing.json());
  });
});

describe("subtasks over the API", () => {
  it("add, complete (progress recomputes), list", async () => {
    const task = await mkTask("with checklist");
    const s1 = await (
      await postSubtask(req("POST", `${BASE}/${task.id}/subtasks`, { title: "one" }), withId(task.id))
    ).json();
    await postSubtask(req("POST", `${BASE}/${task.id}/subtasks`, { title: "two" }), withId(task.id));

    await patchSubtask(
      req("PATCH", `http://localhost/api/v1/subtasks/${s1.subtask.id}`, { completed: true }),
      withId(s1.subtask.id),
    );

    const listed = await (
      await listSubtasks(req("GET", `${BASE}/${task.id}/subtasks`), withId(task.id))
    ).json();
    expect(listed.subtasks.length).toBe(2);
    expect(listed.subtasks.find((s: { title: string }) => s.title === "one").completed).toBe(true);

    const parent = await (await getTask(req("GET", `${BASE}/${task.id}`), withId(task.id))).json();
    expect(parent.task.progressPct).toBe(50);
  });

  it("read-scope tokens cannot write", async () => {
    const task = await mkTask("read only world");
    token = (await createApiToken(seed.memberId, { name: "ro", scopes: ["read"] })).token;
    const res = await postSubtask(
      req("POST", `${BASE}/${task.id}/subtasks`, { title: "nope" }),
      withId(task.id),
    );
    expect(res.status).toBe(403);
  });
});
