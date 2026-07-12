/**
 * seed-stratos.mjs — wipe the target workspace and seed the "Stratos-1"
 * high-altitude balloon demo mission used for docs + marketing screenshots.
 * All writes go through the app's own REST API, authenticated via the login
 * form in a headless browser (same-origin cookies).
 *
 * Usage: KB_EMAIL=... KB_PASS=... node seed-stratos.mjs [--wipe-only]
 *
 * ⚠️ THE WIPE IS REAL. This deletes every project in the target account's
 * workspace before seeding. Docs/marketing refreshes run against a LOCAL dev
 * instance with a scratch workspace — never point KB_BASE at a deployment
 * whose workspace holds real data. The default is localhost on purpose;
 * a remote target must be set explicitly.
 */
import { chromium } from "playwright-core";

const BASE = process.env.KB_BASE || "http://localhost:3000";
const EMAIL = process.env.KB_EMAIL;
const PASS = process.env.KB_PASS;
if (!EMAIL || !PASS) { console.error("Set KB_EMAIL and KB_PASS"); process.exit(1); }

const WIPE_ONLY = process.argv.includes("--wipe-only");

// ---- date helpers: everything is relative to today so DayDash/Calendar look alive
const today = new Date();
const d = (offset) => {
  const x = new Date(today);
  x.setDate(x.getDate() + offset);
  return x.toISOString().slice(0, 10);
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN });
const page = await browser.newPage();

// ---- login
await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(800); // let React hydrate the form so submit is intercepted
await page.fill("#email", EMAIL);
await page.fill("#password", PASS);
await Promise.all([
  page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }),
  page.click("button[type=submit]"),
]);
console.log("logged in →", page.url());

// same-origin fetch helper running inside the page (cookies ride along)
const api = async (method, path, body) =>
  page.evaluate(async ({ method, path, body }) => {
    const res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch {}
    return { status: res.status, json };
  }, { method, path, body });

const must = async (method, path, body) => {
  const r = await api(method, path, body);
  if (r.status >= 300) {
    console.error("FAIL", method, path, r.status, JSON.stringify(r.json)?.slice(0, 300));
    throw new Error("api failure");
  }
  return r.json;
};

// ---- extract reference IDs (priorities / kanban stages / project statuses)
// from the RSC flight payload embedded in server-rendered pages.
// Pull the keyed prop array (e.g. "priorities":[...]) out of the RSC flight
// payload, then read {id,name} pairs from inside it only. Scoping to the key
// avoids cross-type collisions ("Completed" is a stage AND a project status).
const keyedPairsFrom = async (url, key) => {
  await page.goto(BASE + url, { waitUntil: "domcontentloaded" });
  const html = (await page.content()).replace(/\\"/g, '"');
  const start = html.indexOf(`"${key}":[`);
  if (start === -1) return new Map();
  const arr = html.slice(start, html.indexOf("]", start) + 1);
  const pairs = new Map();
  for (const m of arr.matchAll(/\{"id":"([^"]{10,40})"(?:,"workspaceId":"[^"]+")?,"name":"([^"]{1,60})"/g)) {
    pairs.set(m[2], m[1]);
  }
  return pairs;
};

const prioPairs = await keyedPairsFrom("/tasks", "priorities");
const stagePairs = await keyedPairsFrom("/tasks", "kanbanStages");
const PRIO = {}, STAGE = {};
for (const n of ["Very High", "High", "Medium", "Low", "Very Low"])
  if (prioPairs.has(n)) PRIO[n] = prioPairs.get(n);
for (const n of ["Ideas", "In Progress", "On Hold", "Completed", "Cancelled"])
  if (stagePairs.has(n)) STAGE[n] = stagePairs.get(n);
console.log("priorities:", Object.keys(PRIO).length, "stages:", Object.keys(STAGE).length);

const statusPairs = await keyedPairsFrom("/projects", "statuses");
const STATUS = {};
for (const n of ["Not Started", "In Progress", "On Hold", "Delayed", "Completed", "Cancelled"])
  if (statusPairs.has(n)) STATUS[n] = statusPairs.get(n);
console.log("statuses:", Object.keys(STATUS).length);

if (Object.keys(PRIO).length < 5 || Object.keys(STAGE).length < 5 || Object.keys(STATUS).length < 6) {
  console.error("Reference ID extraction incomplete", { PRIO, STAGE, STATUS });
  process.exit(1);
}

// ---- wipe existing data (recurring templates → tasks → projects → tags)
const rec = await must("GET", "/api/recurring-tasks");
for (const t of rec.templates ?? rec.recurringTasks ?? rec ?? [])
  await must("DELETE", `/api/recurring-tasks/${t.id}`);
const tl = await must("GET", "/api/tasks");
for (const t of tl.tasks ?? []) await api("DELETE", `/api/tasks/${t.id}?scope=all`);
const pl = await must("GET", "/api/projects");
for (const p of pl.projects ?? []) await must("DELETE", `/api/projects/${p.id}`);
const tg = await must("GET", "/api/tags");
for (const t of tg.tags ?? []) await must("DELETE", `/api/tags/${t.id}`);
console.log(`wiped: ${ (rec.templates ?? []).length } templates, ${(tl.tasks ?? []).length} tasks, ${(pl.projects ?? []).length} projects, ${(tg.tags ?? []).length} tags`);
if (WIPE_ONLY) { await browser.close(); process.exit(0); }

// ---- workspace + profile cosmetics
await must("PATCH", "/api/settings/workspace", { name: "Stratos-1 Mission Control" });

// ---- tags
const TAG_DEFS = {
  electronics: "#f59e0b", "ham-radio": "#8b5cf6", software: "#3b82f6",
  testing: "#10b981", paperwork: "#64748b", budget: "#ef4444",
  outreach: "#ec4899", "launch-day": "#f97316",
};
const TAG = {};
for (const [name, color] of Object.entries(TAG_DEFS)) {
  const r = await must("POST", "/api/tags", { name });
  TAG[name] = r.tag.id;
  await must("PATCH", `/api/tags/${r.tag.id}`, { color });
}

// ---- projects
const mkProject = async (name, code, status, startDate, endDate) =>
  (await must("POST", "/api/projects", { name, code, statusId: STATUS[status], startDate, endDate })).project.id;

const FEAS = await mkProject("Feasibility & Permissions", "FEAS", "Completed", d(-60), d(-30));
const PAY  = await mkProject("Payload & Electronics",     "PAY",  "In Progress", d(-30), d(20));
const FLT  = await mkProject("Flight Ops & Launch",       "FLT",  "In Progress", d(-14), d(27));
const REC  = await mkProject("Tracking & Recovery",       "REC",  "Not Started", d(14), d(29));

// ---- tasks
// [name, project, stage, prio, imp, urg, start, due, progressPct|null, tags, subtasks(title, done), description, notes]
const T = (o) => o;
const TASKS = [
  // FEAS — everything done
  T({ n: "Research balloon flight regulations", p: FEAS, s: "Completed", pr: "Medium", imp: true, due: d(-40), prog: 100, tags: ["paperwork"],
      desc: "Summarise the rules for latex meteorological balloon flights under the standard exemption. Output: a one-page cheat sheet — max payload mass, line strength limits, notification lead time, distance from airfields." }),
  T({ n: "Define mission goals & success criteria", p: FEAS, s: "Completed", pr: "Medium", imp: true, due: d(-45), tags: [],
      subs: [["Primary: stills from above 30 km", true], ["Secondary: complete telemetry log to landing", true], ["Stretch: same-day payload recovery", true]] }),
  T({ n: "Approve mission budget", p: FEAS, s: "Completed", pr: "High", imp: true, due: d(-35), prog: 100, tags: ["budget"],
      desc: "£420 ceiling agreed: balloon £75, helium £160, tracker parts £95, parachute £30, contingency £60." }),
  T({ n: "File flight notification / NOTAM", p: FEAS, s: "Completed", pr: "High", imp: true, urg: true, due: d(-32), prog: 100, tags: ["paperwork"] }),

  // PAY — the busy build project
  T({ n: "Design tracker PCB", p: PAY, s: "In Progress", pr: "Very High", imp: true, urg: true, start: d(-10), due: d(3), tags: ["electronics"],
      subs: [["Finish schematic review", true], ["Route RF section", true], ["Ground pour + DRC pass", false], ["Order boards from fab", false]],
      desc: "KiCad board: GPS + radio tracker with BME280 and battery monitor. Keep mass under 45 g including the u.FL antenna. RF section needs a proper ground pour — no traces under the GPS patch." }),
  T({ n: "Write telemetry firmware", p: PAY, s: "In Progress", pr: "High", imp: true, start: d(-7), due: d(9), tags: ["software", "electronics"],
      subs: [["GPS NMEA parser", true], ["Sensor sampling loop", false], ["APRS packet encoder", false], ["Low-power sleep mode", false]],
      desc: "Target: one position packet every 60 s, sensor frame every 10 s to SD card. Watchdog reset if no GPS fix for 5 minutes." }),
  T({ n: "Assemble APRS tracker module", p: PAY, s: "Ideas", pr: "High", imp: true, due: d(10), tags: ["ham-radio", "electronics"] }),
  T({ n: "Tune 2 m dipole antenna", p: PAY, s: "In Progress", pr: "Medium", imp: true, due: d(0), tags: ["ham-radio"],
      desc: "Target SWR < 1.5 across the APRS segment with the antenna analyser. Trim both legs equally — 5 mm at a time." }),
  T({ n: "Cold-soak test payload at −40 °C", p: PAY, s: "Ideas", pr: "Medium", imp: true, due: d(16), tags: ["testing"],
      desc: "Dry-ice box soak for 2 h with full telemetry running. Watch for LCD blanking, battery sag and oscillator drift." }),
  T({ n: "Integrate camera module", p: PAY, s: "Ideas", pr: "Low", due: d(14), tags: ["electronics"] }),
  T({ n: "Weigh payload train — confirm under 300 g", p: PAY, s: "Ideas", pr: "Medium", urg: true, due: d(18), tags: ["testing"] }),
  T({ n: "Calculate parachute descent rate", p: PAY, s: "Completed", pr: "Medium", imp: true, prog: 100, tags: ["testing"],
      desc: "36 in chute, 290 g payload → ~4.7 m/s at sea level. Within the 5.5 m/s limit with margin." }),
  T({ n: "Order lithium primary cells", p: PAY, s: "On Hold", pr: "Medium", tags: ["budget", "electronics"],
      notes: "Supplier out of stock — restock ETA next week. Do NOT substitute alkaline: they quit below −20 °C." }),
  T({ n: "Evaluate GSM backup tracker", p: PAY, s: "Cancelled", pr: "Low",
      notes: "Cancelled — no GSM coverage above ~2 km altitude. APRS plus the LoRa downlink is enough." }),
  T({ n: "Build-log blog post #2", p: PAY, s: "Ideas", pr: "Medium", imp: true, due: d(-1), tags: ["outreach"] }),

  // FLT — flight ops
  T({ n: "Secure launch-site permission", p: FLT, s: "Completed", pr: "High", imp: true, prog: 100, tags: ["paperwork"] }),
  T({ n: "Rent helium cylinder (T50)", p: FLT, s: "In Progress", pr: "Very High", imp: true, urg: true, due: d(2), tags: ["budget"],
      desc: "Need ~3.2 m³ for 4.5 kg neck lift. Local welding supplier is cheaper than the party shop — and actually has a regulator." }),
  T({ n: "Write launch-day runbook", p: FLT, s: "In Progress", pr: "High", imp: true, due: d(23), tags: ["launch-day"],
      subs: [["Fill procedure", true], ["Payload arm sequence", false], ["Go/no-go weather criteria", false], ["Abort & scrub procedure", false], ["Roles & comms plan", false]] }),
  T({ n: "Run flight-path predictions", p: FLT, s: "Ideas", pr: "Medium", imp: true, start: d(20), due: d(24), tags: ["software"],
      desc: "Daily prediction runs from T-7. Scrub if the predicted landing is within 10 km of the coast or inside controlled airspace." }),
  T({ n: "Confirm insurance cover", p: FLT, s: "On Hold", pr: "High", imp: true, urg: true, due: d(-2), tags: ["paperwork"],
      notes: "Broker chasing the underwriter — call again Monday morning." }),
  T({ n: "Dry-run fill & rigging practice", p: FLT, s: "Ideas", pr: "Medium", imp: true, due: d(13), tags: ["testing", "launch-day"] }),
  T({ n: "Airborne transmitter legality check", p: FLT, s: "Completed", pr: "High", imp: true, prog: 100, tags: ["ham-radio", "paperwork"] }),
  T({ n: "Daily weather watch from T-7", p: FLT, s: "Ideas", pr: "Medium", urg: true, due: d(20), tags: ["launch-day"] }),
  T({ n: "Design Stratos-1 mission patch", p: FLT, s: "In Progress", pr: "Low", due: d(7), tags: ["outreach"] }),
  T({ n: "Prepare school-visit slides", p: FLT, s: "Ideas", pr: "Medium", imp: true, due: d(16), tags: ["outreach"] }),

  // REC — recovery
  T({ n: "Program chase-car APRS rig", p: REC, s: "Ideas", pr: "Medium", imp: true, due: d(21), tags: ["ham-radio"] }),
  T({ n: "Pack recovery kit", p: REC, s: "Ideas", pr: "Low", due: d(25),
      subs: [["Telescopic pole", false], ["Waders", false], ["First-aid kit", false], ["Spare batteries + power bank", false], ["Printed landowner letter", false]] }),
  T({ n: "Load offline maps on tablets", p: REC, s: "Ideas", pr: "Medium", due: d(22), tags: ["software", "testing"] }),
  T({ n: "Data SIMs for chase phones", p: REC, s: "Ideas", pr: "Low", urg: true, due: d(19), tags: ["budget"] }),
  T({ n: "Draft landowner door-knock script", p: REC, s: "Ideas", pr: "Very Low", due: d(24), tags: ["outreach"] }),
];

let made = 0;
for (const t of TASKS) {
  const body = {
    projectId: t.p, name: t.n, priorityId: PRIO[t.pr], kanbanStageId: STAGE[t.s],
    isImportant: !!t.imp, isUrgent: !!t.urg,
  };
  if (t.start) body.startDate = t.start;
  if (t.due) body.dueDate = t.due;
  if (t.desc) body.description = t.desc;
  if (t.notes) body.notes = t.notes;
  if (t.prog != null) body.progressPct = t.prog;
  if (t.subs) body.subtasks = t.subs.map(([title]) => ({ title }));
  if (t.tags?.length) body.tagIds = t.tags.map((x) => TAG[x]);
  const r = await must("POST", "/api/tasks", body);
  made++;
  // mark completed subtasks
  if (t.subs?.some(([, done]) => done)) {
    const created = r.task.subtasks ?? [];
    for (const [title, done] of t.subs) {
      if (!done) continue;
      const st = created.find((s) => s.title === title);
      if (st) await must("PATCH", `/api/subtasks/${st.id}`, { completed: true });
    }
  }
}
console.log("tasks created:", made);

// ---- recurring templates
const RECURRING = [
  { name: "APRS net check-in", projectId: PAY, priorityId: PRIO["Low"], kanbanStageId: STAGE["Ideas"],
    tagIds: [TAG["ham-radio"]], frequency: "WEEKLY", interval: 1, daysOfWeek: [6], startDate: d(-28), endDate: null,
    description: "Check into the local APRS net and confirm the igate hears our tracker callsign." },
  { name: "Charge & log battery bank", projectId: PAY, priorityId: PRIO["Medium"], kanbanStageId: STAGE["Ideas"],
    tagIds: [TAG["electronics"]], frequency: "WEEKLY", interval: 1, daysOfWeek: [3], startDate: d(-21), endDate: null,
    isImportant: true },
  { name: "Budget reconciliation", projectId: FLT, priorityId: PRIO["Medium"], kanbanStageId: STAGE["Ideas"],
    tagIds: [TAG["budget"]], frequency: "MONTHLY", interval: 1, daysOfWeek: [], startDate: d(-30), endDate: null },
];
for (const r of RECURRING) await must("POST", "/api/recurring-tasks", r);
console.log("recurring templates:", RECURRING.length);

// ---- summary
const check = await must("GET", "/api/tasks");
console.log("FINAL task count:", check.tasks.length);
await browser.close();
