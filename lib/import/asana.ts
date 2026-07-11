/**
 * Asana import — fetch from the Asana API and execute a plan into KanBlam.
 *
 * Powers Settings → Import from Asana. The caller passes the user's Asana
 * personal-access token on every call; it is used transiently and NEVER
 * persisted. Grew out of the one-off migration script that brought the
 * first beta user's Asana project across.
 *
 * Pure planning logic (buildImportPlan + types) lives in ./asana-plan and is
 * re-exported here, so importers can keep using `@/lib/import/asana`.
 */
import { prisma } from "@/lib/db";
import { colorFromName } from "@/lib/tags/color";
import type { AsanaTask, AsanaProjectData, ImportPlan } from "./asana-plan";

export * from "./asana-plan";

const ASANA_BASE = "https://app.asana.com/api/1.0";

/** Any Asana-side failure — bad token, upstream error, unreachable. Carries
 *  an HTTP status the API route surfaces to the client. */
export class AsanaError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "AsanaError";
    this.status = status;
  }
}

interface AsanaEnvelope<T> {
  data: T;
  next_page?: { offset: string } | null;
}

async function asanaRequest<T>(
  token: string,
  path: string,
  params?: Record<string, string | number>,
): Promise<AsanaEnvelope<T>> {
  const url = new URL(ASANA_BASE + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  }
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new AsanaError("Could not reach Asana. Check the connection and try again.", 502);
  }
  if (res.status === 401) {
    throw new AsanaError("That Asana token was rejected — double-check it and try again.", 400);
  }
  if (res.status === 429) {
    throw new AsanaError("Asana is rate-limiting the request. Wait a minute and retry.", 429);
  }
  if (!res.ok) {
    throw new AsanaError(`Asana request failed (HTTP ${res.status}).`, 502);
  }
  return (await res.json()) as AsanaEnvelope<T>;
}

/** GET an endpoint that paginates, following next_page until exhausted. */
async function asanaList<T>(
  token: string,
  path: string,
  params: Record<string, string | number>,
): Promise<T[]> {
  const out: T[] = [];
  let offset: string | undefined;
  do {
    const env = await asanaRequest<T[]>(token, path, {
      ...params,
      limit: 100,
      ...(offset ? { offset } : {}),
    });
    out.push(...env.data);
    offset = env.next_page?.offset;
  } while (offset);
  return out;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export interface AsanaProjectSummary {
  gid: string;
  name: string;
}

/** Validate the token and list the user's (non-archived) Asana projects
 *  across every workspace the token can see. */
export async function fetchAsanaProjects(token: string): Promise<AsanaProjectSummary[]> {
  const me = await asanaRequest<{ workspaces?: { gid: string }[] }>(token, "/users/me", {
    opt_fields: "workspaces",
  });
  const workspaces = me.data.workspaces ?? [];
  const projects: AsanaProjectSummary[] = [];
  for (const ws of workspaces) {
    const list = await asanaList<{ gid: string; name: string; archived: boolean }>(
      token,
      "/projects",
      { workspace: ws.gid, opt_fields: "name,archived" },
    );
    for (const p of list) {
      if (!p.archived) projects.push({ gid: p.gid, name: p.name });
    }
  }
  return projects;
}

interface RawTask {
  gid: string;
  name: string;
  notes?: string;
  completed: boolean;
  due_on?: string | null;
  start_on?: string | null;
  num_subtasks?: number;
  memberships?: { section?: { name?: string } | null }[];
}

/** Pull one Asana project's sections, tasks and subtasks into a normalised
 *  shape, preserving board order. */
export async function fetchAsanaProjectData(
  token: string,
  projectGid: string,
): Promise<AsanaProjectData> {
  const project = await asanaRequest<{ name: string }>(token, `/projects/${projectGid}`, {
    opt_fields: "name",
  });
  const projectName = project.data.name;

  const sectionList = await asanaList<{ name: string }>(
    token,
    `/projects/${projectGid}/sections`,
    { opt_fields: "name" },
  );

  const rawTasks = await asanaList<RawTask>(token, "/tasks", {
    project: projectGid,
    opt_fields: "name,notes,completed,due_on,start_on,num_subtasks,memberships.section.name",
  });

  const sectionOf = (t: RawTask): string => {
    for (const m of t.memberships ?? []) {
      if (m.section?.name) return m.section.name;
    }
    return projectName; // un-sectioned tasks fall back to the project name
  };

  // Group tasks by section, preserving the order they came back in.
  const buckets = new Map<string, AsanaTask[]>();
  for (const t of rawTasks) {
    const sec = sectionOf(t);
    let subtasks: AsanaTask["subtasks"] = [];
    if ((t.num_subtasks ?? 0) > 0) {
      const subs = await asanaList<{ name: string; completed: boolean }>(
        token,
        `/tasks/${t.gid}/subtasks`,
        { opt_fields: "name,completed" },
      );
      subtasks = subs.map((s) => ({ title: s.name, completed: s.completed }));
    }
    const task: AsanaTask = {
      name: t.name,
      notes: t.notes ?? "",
      completed: t.completed,
      dueOn: t.due_on ?? null,
      startOn: t.start_on ?? null,
      section: sec,
      subtasks,
    };
    if (!buckets.has(sec)) buckets.set(sec, []);
    buckets.get(sec)!.push(task);
  }

  // Order sections by the project's section list; append any stragglers.
  const ordered: AsanaProjectData["sections"] = [];
  const seen = new Set<string>();
  for (const s of sectionList) {
    if (buckets.has(s.name)) {
      ordered.push({ name: s.name, tasks: buckets.get(s.name)! });
      seen.add(s.name);
    }
  }
  for (const [name, tasks] of buckets) {
    if (!seen.has(name)) ordered.push({ name, tasks });
  }

  return { projectName, sections: ordered };
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

/** Short, workspace-unique project code derived from the project name. */
function makeCode(name: string, taken: Set<string>): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  let base =
    words.length > 1
      ? words.map((w) => w[0]).join("").slice(0, 5)
      : (words[0] ?? "PRJ").slice(0, 3);
  if (!base) base = "PRJ";
  let code = base;
  let n = 1;
  while (taken.has(code)) code = `${base}${n++}`;
  taken.add(code);
  return code;
}

/** Project names from the plan that already exist in the workspace. */
export async function findProjectNameClashes(
  workspaceId: string,
  plan: ImportPlan,
): Promise<string[]> {
  const names = plan.projects.map((p) => p.name);
  const existing = await prisma.project.findMany({
    where: { workspaceId, name: { in: names } },
    select: { name: true },
  });
  return existing.map((p) => p.name);
}

export interface ImportResult {
  projectsCreated: number;
  tasksCreated: number;
  subtasksCreated: number;
  tagsCreated: number;
}

/** Create the plan's projects, tasks, tags and subtasks in one transaction.
 *  Throws AsanaError(409) if any project name already exists. */
export async function executeImport(
  workspaceId: string,
  plan: ImportPlan,
): Promise<ImportResult> {
  const [stages, priorities, statuses] = await Promise.all([
    prisma.kanbanStage.findMany({ where: { workspaceId }, orderBy: { order: "asc" } }),
    prisma.priority.findMany({ where: { workspaceId }, orderBy: { order: "asc" } }),
    prisma.status.findMany({ where: { workspaceId }, orderBy: { order: "asc" } }),
  ]);
  if (!stages.length || !priorities.length || !statuses.length) {
    throw new AsanaError("This workspace isn't fully set up — missing stages, priorities or statuses.", 500);
  }
  const activeStage = stages.find((s) => !s.isTerminal) ?? stages[0];
  const doneStage = stages.find((s) => s.isTerminal) ?? stages[stages.length - 1];
  const priority =
    priorities.find((p) => p.name.toLowerCase() === "medium") ??
    priorities[Math.floor(priorities.length / 2)];
  const projectStatus = statuses[0];

  const clashes = await findProjectNameClashes(workspaceId, plan);
  if (clashes.length) {
    throw new AsanaError(
      `These project names already exist in your workspace: ${clashes.join(", ")}. Rename or remove them, then import again.`,
      409,
    );
  }

  const existing = await prisma.project.findMany({
    where: { workspaceId },
    select: { code: true },
  });
  const takenCodes = new Set(existing.map((p) => p.code));

  const maxOrder = async (stageId: string) =>
    (
      await prisma.task.aggregate({
        where: { workspaceId, kanbanStageId: stageId },
        _max: { kanbanOrder: true },
      })
    )._max.kanbanOrder ?? 0;
  let activeOrder = await maxOrder(activeStage.id);
  let doneOrder = await maxOrder(doneStage.id);

  const result: ImportResult = {
    projectsCreated: 0,
    tasksCreated: 0,
    subtasksCreated: 0,
    tagsCreated: 0,
  };

  await prisma.$transaction(
    async (tx) => {
      // Tags first (one-project mode) — find-or-create, case-insensitive.
      const tagId = new Map<string, string>();
      for (const name of plan.tags) {
        const found = await tx.tag.findFirst({
          where: { workspaceId, name: { equals: name, mode: "insensitive" } },
          select: { id: true },
        });
        if (found) {
          tagId.set(name, found.id);
        } else {
          const created = await tx.tag.create({
            data: { workspaceId, name, color: colorFromName(name) },
          });
          tagId.set(name, created.id);
          result.tagsCreated++;
        }
      }

      for (const pp of plan.projects) {
        const project = await tx.project.create({
          data: {
            workspaceId,
            name: pp.name,
            code: makeCode(pp.name, takenCodes),
            statusId: projectStatus.id,
          },
        });
        result.projectsCreated++;

        for (const t of pp.tasks) {
          const stage = t.completed ? doneStage : activeStage;
          const order = t.completed ? ++doneOrder : ++activeOrder;
          const connectTag =
            t.sectionTag && tagId.has(t.sectionTag)
              ? { tags: { connect: [{ id: tagId.get(t.sectionTag)! }] } }
              : {};
          const task = await tx.task.create({
            data: {
              workspaceId,
              projectId: project.id,
              name: t.name.slice(0, 500),
              description: t.description ? t.description.slice(0, 10000) : null,
              priorityId: priority.id,
              kanbanStageId: stage.id,
              kanbanOrder: order,
              progressPct: t.completed ? 100 : 0,
              progressManual: t.completed,
              startDate: t.startOn ? new Date(t.startOn) : null,
              dueDate: t.dueOn ? new Date(t.dueOn) : null,
              ...connectTag,
            },
          });
          result.tasksCreated++;

          for (let i = 0; i < t.subtasks.length; i++) {
            await tx.subtask.create({
              data: {
                taskId: task.id,
                title: t.subtasks[i].title.slice(0, 500),
                completed: t.subtasks[i].completed,
                position: i,
              },
            });
            result.subtasksCreated++;
          }
        }
      }
    },
    { timeout: 120_000 },
  );

  return result;
}
