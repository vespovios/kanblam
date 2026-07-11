import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-me";

test.describe("kanban", () => {
  let projectId: string;
  let taskId: string;
  let targetStageId: string;

  test.beforeAll(async () => {
    const ws = await prisma.workspace.findFirstOrThrow();
    const stages = await prisma.kanbanStage.findMany({
      where: { workspaceId: ws.id },
      orderBy: { order: "asc" },
    });
    if (stages.length < 2) {
      throw new Error("Dev DB must have at least 2 kanban stages seeded");
    }
    const status = await prisma.status.findFirstOrThrow({
      where: { workspaceId: ws.id, name: "Not Started" },
    });
    const prio = await prisma.priority.findFirstOrThrow({
      where: { workspaceId: ws.id, name: "Medium" },
    });

    await prisma.task.deleteMany({ where: { name: { startsWith: "KB-" } } });
    await prisma.project.deleteMany({ where: { code: { startsWith: "KB-" } } });

    const project = await prisma.project.create({
      data: { workspaceId: ws.id, name: "Kanban Test", code: `KB-${Date.now()}`, statusId: status.id },
    });
    projectId = project.id;

    const task = await prisma.task.create({
      data: {
        workspaceId: ws.id,
        projectId,
        name: "KB-Task",
        priorityId: prio.id,
        kanbanStageId: stages[0].id,
        kanbanOrder: 1,
      },
    });
    taskId = task.id;
    targetStageId = stages[1].id;
  });

  test.afterAll(async () => {
    await prisma.task.deleteMany({ where: { name: { startsWith: "KB-" } } });
    await prisma.project.deleteMany({ where: { code: { startsWith: "KB-" } } });
    await prisma.$disconnect();
  });

  test("admin moves a card between stages and the backend persists", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/dashboard");

    await page.goto("/kanban");
    await expect(page.getByText("KB-Task")).toBeVisible();

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const res = await page.request.post(`/api/tasks/${taskId}/move`, {
      data: { kanbanStageId: targetStageId },
      headers: { Cookie: cookieHeader },
    });
    expect(res.status()).toBe(200);

    await page.reload();
    await expect(page.getByText("KB-Task")).toBeVisible();

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(updated.kanbanStageId).toBe(targetStageId);
  });
});
