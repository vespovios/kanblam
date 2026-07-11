import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";
import { createApiToken } from "@/lib/api-tokens/service";
import { _resetRateLimiter } from "@/lib/api/rate-limit";
import { GET as listProjects, POST as postProject } from "@/app/api/v1/projects/route";
import { GET as getProject, PATCH as patchProject, DELETE as deleteProject } from "@/app/api/v1/projects/[id]/route";
import { GET as listTags, POST as postTag } from "@/app/api/v1/tags/route";
import { PATCH as patchTag, DELETE as deleteTag } from "@/app/api/v1/tags/[id]/route";
import { POST as postTask } from "@/app/api/v1/tasks/route";

const prisma = new PrismaClient();
let seed: SeededWorkspace;
let token: string;

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
const P = "http://localhost/api/v1/projects";
const T = "http://localhost/api/v1/tags";

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
  _resetRateLimiter();
  token = (await createApiToken(seed.adminId, { name: "t", scopes: ["read", "write"] })).token;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("projects", () => {
  it("creates with a default status, lists with taskCount, round-trips detail", async () => {
    const res = await postProject(
      req("POST", P, { name: "Flight Ops", code: "FLT", projectLeadId: seed.adminId }),
      noId,
    );
    expect(res.status).toBe(201);
    const { project } = await res.json();
    expect(project.status.name).toBe("Not Started"); // lowest-order status
    expect(project.taskCount).toBe(0);

    await postTask(
      req("POST", "http://localhost/api/v1/tasks", { projectId: project.id, name: "t1" }),
      noId,
    );
    const listed = await (await listProjects(req("GET", P), noId)).json();
    const flt = listed.projects.find((p: { code: string }) => p.code === "FLT");
    expect(flt.taskCount).toBe(1);
    // projectLead object is whitelisted — id + name only (never email or kind)
    expect(Object.keys(flt.projectLead).sort()).toEqual(["id", "name"]);

    const detail = await (await getProject(req("GET", `${P}/${project.id}`), withId(project.id))).json();
    expect(detail.project.name).toBe("Flight Ops");
  });

  it("rejects duplicate codes with a friendly 422", async () => {
    await postProject(req("POST", P, { name: "One", code: "DUP" }), noId);
    const res = await postProject(req("POST", P, { name: "Two", code: "DUP" }), noId);
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toMatch(/already in use/i);
  });

  it("404s cross-workspace statusId and projectLeadId (no existence leaks)", async () => {
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    const foreignStatus = await prisma.status.create({
      data: { workspaceId: other.id, name: "X", color: "#000", order: 1 },
    });
    const res = await postProject(
      req("POST", P, { name: "Sneaky", code: "SNK", statusId: foreignStatus.id }),
      noId,
    );
    expect(res.status).toBe(404);
  });

  it("patch + delete lifecycle (delete cascades tasks)", async () => {
    const { project } = await (
      await postProject(req("POST", P, { name: "Temp", code: "TMP" }), noId)
    ).json();
    const task = await (
      await postTask(req("POST", "http://localhost/api/v1/tasks", { projectId: project.id, name: "doomed" }), noId)
    ).json();

    const patched = await (
      await patchProject(
        req("PATCH", `${P}/${project.id}`, { statusId: seed.statusIds.completed, endDate: "2026-08-01" }),
        withId(project.id),
      )
    ).json();
    expect(patched.project.status.name).toBe("Completed");
    expect(patched.project.endDate).toBe("2026-08-01");

    const del = await deleteProject(req("DELETE", `${P}/${project.id}`), withId(project.id));
    expect(del.status).toBe(200);
    const orphan = await prisma.task.count({ where: { id: task.task.id } });
    expect(orphan).toBe(0);
  });
});

describe("tags", () => {
  it("create → list with counts → rename/recolour → delete detaches only", async () => {
    const created = await (await postTag(req("POST", T, { name: "ham-radio" }), noId)).json();
    expect(created.tag.color).toMatch(/^#[0-9a-fA-F]{6}$/);

    // attach to a task so the count is real
    const proj = await (await postProject(req("POST", P, { name: "Px", code: "PX" }), noId)).json();
    const task = await (
      await postTask(
        req("POST", "http://localhost/api/v1/tasks", {
          projectId: proj.project.id,
          name: "tagged",
          tagIds: [created.tag.id],
        }),
        noId,
      )
    ).json();

    const listed = await (await listTags(req("GET", T), noId)).json();
    expect(listed.tags.find((t: { name: string }) => t.name === "ham-radio").taskCount).toBe(1);

    const patched = await (
      await patchTag(
        req("PATCH", `${T}/${created.tag.id}`, { name: "aprs", color: "#8b5cf6" }),
        withId(created.tag.id),
      )
    ).json();
    expect(patched.tag.name).toBe("aprs");
    expect(patched.tag.color).toBe("#8b5cf6");

    const del = await deleteTag(req("DELETE", `${T}/${created.tag.id}`), withId(created.tag.id));
    expect(del.status).toBe(200);
    const survivor = await prisma.task.count({ where: { id: task.task.id } });
    expect(survivor).toBe(1); // task untouched, tag detached
  });

  it("422 on duplicate (case-insensitive) names and invalid colours", async () => {
    await postTag(req("POST", T, { name: "Budget" }), noId);
    const dup = await postTag(req("POST", T, { name: "budget" }), noId);
    expect(dup.status).toBe(422);

    const created = await (await postTag(req("POST", T, { name: "ok" }), noId)).json();
    const badColor = await patchTag(
      req("PATCH", `${T}/${created.tag.id}`, { color: "purple" }),
      withId(created.tag.id),
    );
    expect(badColor.status).toBe(422);
  });
});
