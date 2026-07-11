/**
 * capture-screenshots.mjs — screenshot the Stratos-1 demo workspace for docs
 * (public/images/docs/) and marketing (public/images/marketing/).
 *
 * Usage: KB_EMAIL=... KB_PASS=... [PART=1|2] [SHOTS=a,b,c] [HERO=1] \
 *          node capture-screenshots.mjs
 * PART=1 = main views · PART=2 = drawer/dialogs/project detail · HERO=1 = wide
 * hero shot. SHOTS= limits nav-based captures to the named shots (handy for
 * chunked runs in time-limited shells). Pages use fixed waits — networkidle
 * never fires because of the app's SSE realtime stream.
 * Output: ./out/*.png. NEVER ship settings.png — it shows the account email.
 * Needs playwright-core + a chromium binary via CHROMIUM_BIN.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.KB_BASE || "https://kanblam.com";
const EMAIL = process.env.KB_EMAIL;
const PASS = process.env.KB_PASS;
const PART = process.env.PART || "1";
const SHOTS = (process.env.SHOTS || "").split(",").filter(Boolean);
if (!EMAIL || !PASS) { console.error("Set KB_EMAIL and KB_PASS"); process.exit(1); }
mkdirSync("out", { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN });
const ctx = await browser.newContext({
  viewport: { width: 1560, height: 975 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500); await page.fill("#email", EMAIL);
await page.fill("#password", PASS);
await Promise.all([
  page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }),
  page.click("button[type=submit]"),
]);
console.log("logged in");

const settle = async (ms = 2500) => { await page.waitForTimeout(ms); };
const shot = async (name) => { await page.screenshot({ path: `out/${name}.png` }); console.log("✓", name); };
const nav = async (url, name, ms) => { if (name && SHOTS.length && !SHOTS.includes(name)) return; await page.goto(BASE + url, { waitUntil: "domcontentloaded" }); await settle(ms); if (name) await shot(name); };

async function captureHero() {
  // reuse the logged-in page; just change the viewport for the wide hero crop
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(BASE + "/kanban", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "out/hero-kanban.png" });
  console.log("✓ hero-kanban");
}


if (PART === "1") {
  await nav("/dashboard", "daydash");
  await nav("/tasks", "tasks");
  await nav("/kanban", "kanban");
  await nav("/kanban?lane=project", "kanban-swimlanes");
  await nav("/eisenhower", "eisenhower");
  await nav("/calendar", "calendar-month");
  await nav("/calendar?view=week", "calendar-week");
  await nav("/tags", "tags");
  await nav("/projects", "projects");
} else if (process.env.HERO === "1") {
  await captureHero();
} else {
  // project detail — find the PAY project id via the API
  const projects = await page.evaluate(async () => (await (await fetch("/api/projects")).json()).projects);
  const pay = projects.find((p) => p.code === "PAY");
  if (pay) await nav(`/projects/${pay.id}`, "project-detail", 1500);

  // task drawer — open "Design tracker PCB" from the tasks table
  await nav("/tasks", null);
  await page.getByText("Design tracker PCB", { exact: false }).first().click();
  await page.waitForTimeout(1500);
  await shot("task-drawer");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // quick add with tokens typed (palette parses live)
  await page.keyboard.press("ControlOrMeta+KeyK");
  await page.waitForTimeout(800);
  await page.keyboard.type("Solder GPS header [PAY] #electronics !high !important due:fri", { delay: 30 });
  await page.waitForTimeout(800);
  await shot("quick-add");
  await page.keyboard.press("Escape");

  // new-task dialog with the Repeat field visible (recurring create path)
  await nav("/tasks", null);
  const newBtn = page.getByRole("button", { name: /new task/i }).first();
  if (await newBtn.count()) {
    await newBtn.click();
    await page.waitForTimeout(1000);
    await shot("task-create-dialog");
    await page.keyboard.press("Escape");
  }

  // settings (working days / holidays / team)
  await nav("/settings", "settings", 1500);

}

await browser.close();
