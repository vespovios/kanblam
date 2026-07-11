/**
 * Stratos-1 demo dataset — a high-altitude balloon mission (KanBlam's
 * "Trip to Mars"). Seeded server-side into a fresh demo workspace by
 * /api/demo. The same dataset lives on the docs/marketing screenshots
 * (see scripts/demo/seed-stratos.mjs, the API-driven variant used against
 * the showcase tenant), so demo visitors land in the exact workspace the
 * docs walk them through.
 *
 * All dates are relative to seed time, so every demo looks freshly alive:
 * a couple of overdue tasks, something due today, a launch four weeks out.
 */

import { prisma } from "@/lib/db";
import { createProject } from "@/lib/projects/service";
import { createTask } from "@/lib/tasks/service";
import { createTag } from "@/lib/tags/service";
import { updateSubtask } from "@/lib/subtasks/service";
import { createTemplate, generateInstancesForWorkspace } from "@/lib/recurring/service";
import { createComment } from "@/lib/comments/service";

const iso = (offsetDays: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

const TAGS: Record<string, string> = {
  electronics: "#f59e0b",
  "ham-radio": "#8b5cf6",
  software: "#3b82f6",
  testing: "#10b981",
  paperwork: "#64748b",
  budget: "#ef4444",
  outreach: "#ec4899",
  "launch-day": "#f97316",
};

interface DemoTask {
  n: string; // name
  p: "FEAS" | "PAY" | "FLT" | "REC";
  s: "Ideas" | "In Progress" | "On Hold" | "Completed" | "Cancelled";
  pr: "Very High" | "High" | "Medium" | "Low" | "Very Low";
  imp?: boolean;
  urg?: boolean;
  start?: number; // day offset
  due?: number; // day offset
  prog?: number;
  tags?: (keyof typeof TAGS)[];
  subs?: [title: string, done: boolean][];
  desc?: string;
  notes?: string;
  /** Assign to the Flight Computer agent member instead of the human admin
   *  (only when the workspace has one — see seedStratosData's agentId param). */
  agent?: boolean;
}

const TASKS: DemoTask[] = [
  // FEAS — feasibility, all wrapped up
  { n: "Research balloon flight regulations", p: "FEAS", s: "Completed", pr: "Medium", imp: true, due: -40, prog: 100, tags: ["paperwork"],
    desc: "Summarise the rules for latex meteorological balloon flights under the standard exemption. Output: a one-page cheat sheet — max payload mass, line strength limits, notification lead time, distance from airfields." },
  { n: "Define mission goals & success criteria", p: "FEAS", s: "Completed", pr: "Medium", imp: true, due: -45,
    subs: [["Primary: stills from above 30 km", true], ["Secondary: complete telemetry log to landing", true], ["Stretch: same-day payload recovery", true]] },
  { n: "Approve mission budget", p: "FEAS", s: "Completed", pr: "High", imp: true, due: -35, prog: 100, tags: ["budget"],
    desc: "£420 ceiling agreed: balloon £75, helium £160, tracker parts £95, parachute £30, contingency £60." },
  { n: "File flight notification / NOTAM", p: "FEAS", s: "Completed", pr: "High", imp: true, urg: true, due: -32, prog: 100, tags: ["paperwork"] },

  // PAY — the busy build project
  { n: "Design tracker PCB", p: "PAY", s: "In Progress", pr: "Very High", imp: true, urg: true, start: -10, due: 3, tags: ["electronics"],
    subs: [["Finish schematic review", true], ["Route RF section", true], ["Ground pour + DRC pass", false], ["Order boards from fab", false]],
    desc: "KiCad board: GPS + radio tracker with BME280 and battery monitor. Keep mass under 45 g including the u.FL antenna. RF section needs a proper ground pour — no traces under the GPS patch." },
  // "APRS net check-in" and "Charge & log battery bank" (the two tasks named
  // in the Task 12 spec) only exist as recurring templates below, not as
  // TASKS entries — so per the fallback rule we mark the two closest
  // telemetry/logging-flavored PAY tasks instead: this one literally logs
  // sensor frames to SD card, and the APRS tracker assembly below is the
  // clearest thematic match to the APRS net check-in template.
  { n: "Write telemetry firmware", p: "PAY", s: "In Progress", pr: "High", imp: true, start: -7, due: 9, tags: ["software", "electronics"], agent: true,
    subs: [["GPS NMEA parser", true], ["Sensor sampling loop", false], ["APRS packet encoder", false], ["Low-power sleep mode", false]],
    desc: "Target: one position packet every 60 s, sensor frame every 10 s to SD card. Watchdog reset if no GPS fix for 5 minutes." },
  { n: "Assemble APRS tracker module", p: "PAY", s: "Ideas", pr: "High", imp: true, due: 10, tags: ["ham-radio", "electronics"], agent: true },
  { n: "Tune 2 m dipole antenna", p: "PAY", s: "In Progress", pr: "Medium", imp: true, due: 0, tags: ["ham-radio"],
    desc: "Target SWR < 1.5 across the APRS segment with the antenna analyser. Trim both legs equally — 5 mm at a time." },
  { n: "Cold-soak test payload at −40 °C", p: "PAY", s: "Ideas", pr: "Medium", imp: true, due: 16, tags: ["testing"],
    desc: "Dry-ice box soak for 2 h with full telemetry running. Watch for LCD blanking, battery sag and oscillator drift." },
  { n: "Integrate camera module", p: "PAY", s: "Ideas", pr: "Low", due: 14, tags: ["electronics"] },
  { n: "Weigh payload train — confirm under 300 g", p: "PAY", s: "Ideas", pr: "Medium", urg: true, due: 18, tags: ["testing"] },
  { n: "Calculate parachute descent rate", p: "PAY", s: "Completed", pr: "Medium", imp: true, prog: 100, tags: ["testing"],
    desc: "36 in chute, 290 g payload → ~4.7 m/s at sea level. Within the 5.5 m/s limit with margin." },
  { n: "Order lithium primary cells", p: "PAY", s: "On Hold", pr: "Medium", tags: ["budget", "electronics"],
    notes: "Supplier out of stock — restock ETA next week. Do NOT substitute alkaline: they quit below −20 °C." },
  { n: "Evaluate GSM backup tracker", p: "PAY", s: "Cancelled", pr: "Low",
    notes: "Cancelled — no GSM coverage above ~2 km altitude. APRS plus the LoRa downlink is enough." },
  { n: "Build-log blog post #2", p: "PAY", s: "Ideas", pr: "Medium", imp: true, due: -1, tags: ["outreach"] },

  // FLT — flight ops
  { n: "Secure launch-site permission", p: "FLT", s: "Completed", pr: "High", imp: true, prog: 100, tags: ["paperwork"] },
  { n: "Rent helium cylinder (T50)", p: "FLT", s: "In Progress", pr: "Very High", imp: true, urg: true, due: 2, tags: ["budget"],
    desc: "Need ~3.2 m³ for 4.5 kg neck lift. Local welding supplier is cheaper than the party shop — and actually has a regulator." },
  { n: "Write launch-day runbook", p: "FLT", s: "In Progress", pr: "High", imp: true, due: 23, tags: ["launch-day"],
    subs: [["Fill procedure", true], ["Payload arm sequence", false], ["Go/no-go weather criteria", false], ["Abort & scrub procedure", false], ["Roles & comms plan", false]] },
  { n: "Run flight-path predictions", p: "FLT", s: "Ideas", pr: "Medium", imp: true, start: 20, due: 24, tags: ["software"],
    desc: "Daily prediction runs from T-7. Scrub if the predicted landing is within 10 km of the coast or inside controlled airspace." },
  { n: "Confirm insurance cover", p: "FLT", s: "On Hold", pr: "High", imp: true, urg: true, due: -2, tags: ["paperwork"],
    notes: "Broker chasing the underwriter — call again Monday morning." },
  { n: "Dry-run fill & rigging practice", p: "FLT", s: "Ideas", pr: "Medium", imp: true, due: 13, tags: ["testing", "launch-day"] },
  { n: "Airborne transmitter legality check", p: "FLT", s: "Completed", pr: "High", imp: true, prog: 100, tags: ["ham-radio", "paperwork"] },
  { n: "Daily weather watch from T-7", p: "FLT", s: "Ideas", pr: "Medium", urg: true, due: 20, tags: ["launch-day"] },
  { n: "Design Stratos-1 mission patch", p: "FLT", s: "In Progress", pr: "Low", due: 7, tags: ["outreach"] },
  { n: "Prepare school-visit slides", p: "FLT", s: "Ideas", pr: "Medium", imp: true, due: 16, tags: ["outreach"] },

  // REC — recovery
  { n: "Program chase-car APRS rig", p: "REC", s: "Ideas", pr: "Medium", imp: true, due: 21, tags: ["ham-radio"] },
  { n: "Pack recovery kit", p: "REC", s: "Ideas", pr: "Low", due: 25,
    subs: [["Telescopic pole", false], ["Waders", false], ["First-aid kit", false], ["Spare batteries + power bank", false], ["Printed landowner letter", false]] },
  { n: "Load offline maps on tablets", p: "REC", s: "Ideas", pr: "Medium", due: 22, tags: ["software", "testing"] },
  { n: "Data SIMs for chase phones", p: "REC", s: "Ideas", pr: "Low", urg: true, due: 19, tags: ["budget"] },
  { n: "Draft landowner door-knock script", p: "REC", s: "Ideas", pr: "Very Low", due: 24, tags: ["outreach"] },
];

/** Populate a freshly provisioned demo workspace. Assumes default
 *  statuses/priorities/stages already exist (provisionDemoWorkspace).
 *  agentId, when provided, is the Flight Computer agent member — a couple
 *  of PAY tasks (flagged `agent: true` in TASKS) are assigned to it and get
 *  a status-update comment so demo visitors see Agent Members in action. */
export async function seedStratosData(
  workspaceId: string,
  userId: string,
  agentId?: string,
): Promise<void> {
  const [statuses, priorities, stages] = await Promise.all([
    prisma.status.findMany({ where: { workspaceId } }),
    prisma.priority.findMany({ where: { workspaceId } }),
    prisma.kanbanStage.findMany({ where: { workspaceId } }),
  ]);
  const byName = (rows: { id: string; name: string }[]) =>
    Object.fromEntries(rows.map((r) => [r.name, r.id]));
  const STATUS = byName(statuses);
  const PRIO = byName(priorities);
  const STAGE = byName(stages);

  // Tags (service validates the name; colour set directly after create)
  const tagIds: Record<string, string> = {};
  for (const [name, color] of Object.entries(TAGS)) {
    const tag = await createTag(workspaceId, { name });
    await prisma.tag.update({ where: { id: tag.id }, data: { color } });
    tagIds[name] = tag.id;
  }

  // Projects
  const mkProject = async (
    name: string, code: string, status: string, start: number, end: number,
  ) => {
    const p = await createProject(workspaceId, {
      name, code, statusId: STATUS[status], startDate: iso(start), endDate: iso(end),
    });
    return p.id;
  };
  const projectIds = {
    FEAS: await mkProject("Feasibility & Permissions", "FEAS", "Completed", -60, -30),
    PAY: await mkProject("Payload & Electronics", "PAY", "In Progress", -30, 20),
    FLT: await mkProject("Flight Ops & Launch", "FLT", "In Progress", -14, 27),
    REC: await mkProject("Tracking & Recovery", "REC", "Not Started", 14, 29),
  };

  // Tasks (+ completed-subtask flags via the service so parent progress recomputes)
  const taskIdByName: Record<string, string> = {};
  for (const t of TASKS) {
    const task = await createTask(workspaceId, {
      projectId: projectIds[t.p],
      name: t.n,
      priorityId: PRIO[t.pr],
      kanbanStageId: STAGE[t.s],
      assigneeId: t.agent && agentId ? agentId : userId,
      isImportant: !!t.imp,
      isUrgent: !!t.urg,
      ...(t.start !== undefined && { startDate: iso(t.start) }),
      ...(t.due !== undefined && { dueDate: iso(t.due) }),
      ...(t.desc && { description: t.desc }),
      ...(t.notes && { notes: t.notes }),
      ...(t.prog !== undefined && { progressPct: t.prog }),
      ...(t.subs && { subtasks: t.subs.map(([title]) => ({ title })) }),
      ...(t.tags && { tagIds: t.tags.map((x) => tagIds[x]) }),
    });
    if (!task) throw new Error(`demo seed: task creation failed for "${t.n}"`);
    taskIdByName[t.n] = task.id;
    if (t.subs?.some(([, done]) => done)) {
      const doneTitles = new Set(t.subs.filter(([, done]) => done).map(([title]) => title));
      for (const sub of task.subtasks ?? []) {
        if (doneTitles.has(sub.title)) {
          await updateSubtask(workspaceId, sub.id, { completed: true });
        }
      }
    }
  }

  // Flight Computer status-update comments on its two assigned tasks, so
  // the agent's presence shows up in the task drawer, not just the assignee
  // avatar.
  if (agentId) {
    const agentComments: [string, string][] = [
      ["Write telemetry firmware", "Logged 24h of bench telemetry to SD — GPS fix rate 98%, no watchdog resets. Sensor sampling loop next."],
      ["Assemble APRS tracker module", "Checked into the APRS net at 19:00 UTC — packet path clean, no action needed."],
    ];
    for (const [taskName, body] of agentComments) {
      const comment = await createComment(workspaceId, taskIdByName[taskName], agentId, { body });
      if (!comment) throw new Error(`demo seed: agent comment failed for "${taskName}"`);
    }
  }

  // Recurring templates + an initial instance window, so the board shows
  // 🔁 tasks immediately (the cron would otherwise take up to 5 minutes).
  const templates = [
    { name: "APRS net check-in", projectId: projectIds.PAY, priorityId: PRIO["Low"],
      kanbanStageId: STAGE["Ideas"], tagIds: [tagIds["ham-radio"]],
      frequency: "WEEKLY" as const, interval: 1, daysOfWeek: [6], startDate: iso(-28), endDate: null,
      description: "Check into the local APRS net and confirm the igate hears our tracker callsign." },
    { name: "Charge & log battery bank", projectId: projectIds.PAY, priorityId: PRIO["Medium"],
      kanbanStageId: STAGE["Ideas"], tagIds: [tagIds["electronics"]], isImportant: true,
      frequency: "WEEKLY" as const, interval: 1, daysOfWeek: [3], startDate: iso(-21), endDate: null },
    { name: "Budget reconciliation", projectId: projectIds.FLT, priorityId: PRIO["Medium"],
      kanbanStageId: STAGE["Ideas"], tagIds: [tagIds["budget"]],
      frequency: "MONTHLY" as const, interval: 1, daysOfWeek: [], startDate: iso(-30), endDate: null },
  ];
  for (const tpl of templates) {
    const created = await createTemplate(workspaceId, userId, tpl);
    if (!created) throw new Error(`demo seed: template creation failed for "${tpl.name}"`);
  }
  await generateInstancesForWorkspace(workspaceId, new Date(), 30);

  // Past recurring instances read as done — the club keeps its habits.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  await prisma.task.updateMany({
    where: {
      workspaceId,
      recurringTemplateId: { not: null },
      dueDate: { lt: todayStart },
    },
    data: { kanbanStageId: STAGE["Completed"], progressPct: 100 },
  });
}
