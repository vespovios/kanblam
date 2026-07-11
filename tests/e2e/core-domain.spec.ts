import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-me";

test.describe("core domain", () => {
  test.afterAll(async () => {
    await prisma.task.deleteMany({ where: { name: { startsWith: "E2E-" } } });
    await prisma.project.deleteMany({ where: { code: { startsWith: "E2E-" } } });
    await prisma.$disconnect();
  });

  test("admin creates project, creates task, edits it, deletes it", async ({ page }) => {
    test.setTimeout(90_000);
    const code = `E2E-${Date.now()}`;

    // 1. Login
    await page.goto("/login");
    await page.fill('input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/dashboard");

    // 2. Go to Projects, open create dialog
    await page.getByRole("link", { name: "Projects" }).click();
    await page.waitForURL("/projects");
    await page.getByRole("button", { name: /new project/i }).click();
    // Wait for the dialog to open (name input visible)
    await expect(page.locator('input[id="name"]')).toBeVisible();
    await page.fill('input[id="name"]', "E2E Project");
    await page.fill('input[id="code"]', code);
    await page.getByRole("button", { name: /create project/i }).click();

    // 3. Wait for project link to appear after dialog closes + page refresh
    await expect(page.getByRole("link", { name: "E2E Project" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("link", { name: "E2E Project" }).click();
    await expect(page.getByRole("heading", { name: /E2E Project/ })).toBeVisible();

    // 4. Tasks tab — create a task (scope to main to avoid matching sidebar "Tasks" link)
    await page.locator("main").getByRole("link", { name: "Tasks" }).click();
    await page.getByRole("button", { name: /new task/i }).click();
    // Wait for task dialog to open
    await expect(page.locator('input[id="name"]')).toBeVisible();
    await page.fill('input[id="name"]', "E2E-Task-1");
    await page.getByRole("button", { name: /create task/i }).click();

    await expect(page.getByRole("cell", { name: "E2E-Task-1" })).toBeVisible({ timeout: 15_000 });

    // 6. Global /tasks, click row → drawer
    await page.goto("/tasks");
    await page.getByRole("cell", { name: "E2E-Task-1" }).click();
    await expect(page.getByRole("heading", { name: "E2E-Task-1" })).toBeVisible();

    // 7. Edit name via drawer
    await page.fill('input[id="name"]', "E2E-Task-Renamed");
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByRole("cell", { name: "E2E-Task-Renamed" })).toBeVisible({ timeout: 15_000 });

    // 8. Delete via drawer
    page.on("dialog", (d) => d.accept());
    await page.getByRole("cell", { name: "E2E-Task-Renamed" }).click();
    await page.getByRole("button", { name: /^delete$/i }).click();
    await expect(page.getByRole("cell", { name: "E2E-Task-Renamed" })).not.toBeVisible({ timeout: 15_000 });
  });
});
