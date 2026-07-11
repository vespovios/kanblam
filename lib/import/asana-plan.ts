/**
 * Pure Asana → KanBlam import planning — no IO, no Prisma, no fetch.
 *
 * Split out from asana.ts so the planning logic can be unit-tested without a
 * database. asana.ts re-exports everything here, so importers can keep using
 * `@/lib/import/asana`.
 */

export interface AsanaTask {
  name: string;
  notes: string;
  completed: boolean;
  dueOn: string | null;
  startOn: string | null;
  section: string;
  subtasks: { title: string; completed: boolean }[];
}

export interface AsanaProjectData {
  projectName: string;
  /** Sections in board order, each with its tasks in board order. */
  sections: { name: string; tasks: AsanaTask[] }[];
}

export type ImportMode = "sections-as-projects" | "one-project";

export interface PlannedTask {
  name: string;
  description: string | null;
  completed: boolean;
  dueOn: string | null;
  startOn: string | null;
  /** Section label to attach as a tag (one-project mode only). */
  sectionTag: string | null;
  subtasks: { title: string; completed: boolean }[];
}

export interface PlannedProject {
  name: string;
  tasks: PlannedTask[];
}

export interface ImportPlan {
  mode: ImportMode;
  projects: PlannedProject[];
  /** Distinct section tags to create (one-project mode). */
  tags: string[];
  totalTasks: number;
  totalSubtasks: number;
}

/** Drop a trailing " - To Do" (and similar) that Asana users add to section
 *  names — noise once the section becomes a KanBlam project or tag. */
function tidyLabel(s: string): string {
  return s.replace(/\s*[-–—]\s*to\s*do\s*$/i, "").trim() || s.trim();
}

function toPlannedTask(t: AsanaTask, sectionTag: string | null): PlannedTask {
  return {
    name: t.name,
    description: t.notes.trim() ? t.notes : null,
    completed: t.completed,
    dueOn: t.dueOn,
    startOn: t.startOn,
    sectionTag,
    subtasks: t.subtasks,
  };
}

/** Turn fetched Asana data into a concrete KanBlam import plan. */
export function buildImportPlan(data: AsanaProjectData, mode: ImportMode): ImportPlan {
  const nonEmpty = data.sections.filter((s) => s.tasks.length > 0);
  let projects: PlannedProject[];
  let tags: string[];

  if (mode === "sections-as-projects") {
    projects = nonEmpty.map((s) => ({
      name: tidyLabel(s.name),
      tasks: s.tasks.map((t) => toPlannedTask(t, null)),
    }));
    tags = [];
  } else {
    // one-project: a single KanBlam project, sections preserved as tags.
    const tasks: PlannedTask[] = [];
    for (const s of nonEmpty) {
      const tag = tidyLabel(s.name);
      for (const t of s.tasks) tasks.push(toPlannedTask(t, tag));
    }
    projects = [{ name: data.projectName, tasks }];
    tags = [...new Set(nonEmpty.map((s) => tidyLabel(s.name)))];
  }

  const totalTasks = projects.reduce((n, p) => n + p.tasks.length, 0);
  const totalSubtasks = projects.reduce(
    (n, p) => n + p.tasks.reduce((m, t) => m + t.subtasks.length, 0),
    0,
  );
  return { mode, projects, tags, totalTasks, totalSubtasks };
}
