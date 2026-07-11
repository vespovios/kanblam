import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomBytes, createHash } from "crypto";

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const prisma = new PrismaClient();

// Uses the dev database seeded with admin@example.com / change-me (from .env)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-me";

test.describe("invite flow", () => {
  const newEmail = `teammate-${Date.now()}@test.local`;

  test.beforeEach(async () => {
    // Clean any prior user or invite with this email
    await prisma.invite.deleteMany({ where: { email: newEmail } });
    await prisma.user.deleteMany({ where: { email: newEmail } });
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("admin invites, teammate signs up, teammate logs in", async ({ page, browser }) => {
    // 1. Admin logs in
    await page.goto("/login");
    await page.fill('input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/dashboard");

    // 2. Admin goes to Settings and sends invite
    await page.goto("/settings");
    await page.fill('input[name="email"]', newEmail);
    await page.click('button[type="submit"]');
    await expect(page.getByText(`Invite sent to ${newEmail}`)).toBeVisible({ timeout: 5000 });

    // 3. Replace the invite's tokenHash with one we know the raw value of
    //    (real flow would email the token; for E2E we generate our own)
    const rawToken = generateToken();
    const invite = await prisma.invite.findFirstOrThrow({
      where: { email: newEmail },
      orderBy: { createdAt: "desc" },
    });
    await prisma.invite.update({
      where: { id: invite.id },
      data: { tokenHash: hashToken(rawToken) },
    });

    // 4. New teammate opens the signup link in a fresh browser context
    const teammateContext = await browser.newContext();
    const teammatePage = await teammateContext.newPage();
    await teammatePage.goto(`/signup?token=${rawToken}`);
    await teammatePage.fill('input[name="name"]', "Teammate");
    await teammatePage.fill('input[name="password"]', "teammate-pw");
    await teammatePage.click('button[type="submit"]');
    await teammatePage.waitForURL(/\/login/);

    // 5. Teammate logs in
    await teammatePage.fill('input[name="email"]', newEmail);
    await teammatePage.fill('input[name="password"]', "teammate-pw");
    await teammatePage.click('button[type="submit"]');
    await teammatePage.waitForURL("/dashboard");
    await expect(teammatePage.getByText("Welcome back, Teammate")).toBeVisible();

    await teammateContext.close();
  });
});
