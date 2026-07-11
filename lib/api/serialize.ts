import { quadrantFor } from "@/lib/eisenhower/quadrants";

/**
 * Public-API (/api/v1) response shapes. These are the CONTRACT — additive
 * changes only within v1. Serializers exist so internal Prisma shapes can
 * evolve without leaking into the public surface:
 * - dates: `startDate`/`dueDate` are date-only (YYYY-MM-DD); timestamps ISO
 * - assignee emails are not exposed (id + name, same as /members)
 * - `quadrant` is derived from the two flags as a convenience
 */

interface TaskRow {
  id: string;
  name: string;
  description: string | null;
  notes: string | null;
  isImportant: boolean;
  isUrgent: boolean;
  progressPct: number;
  progressManual: boolean;
  startDate: Date | null;
  dueDate: Date | null;
  recurringTemplateId: string | null;
  createdAt: Date;
  updatedAt: Date;
  priority: { id: string; name: string };
  kanbanStage: { id: string; name: string; isTerminal: boolean };
  project: { id: string; name: string; code: string };
  assignee: { id: string; name: string | null } | null;
  tags: { id: string; name: string; color: string }[];
  subtasks: { id: string; title: string; completed: boolean; position: number }[];
}

const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export function serializeTask(t: TaskRow) {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    notes: t.notes,
    project: t.project,
    stage: { id: t.kanbanStage.id, name: t.kanbanStage.name, isTerminal: t.kanbanStage.isTerminal },
    priority: { id: t.priority.id, name: t.priority.name },
    assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.name } : null,
    isImportant: t.isImportant,
    isUrgent: t.isUrgent,
    quadrant: quadrantFor({ isImportant: t.isImportant, isUrgent: t.isUrgent }),
    startDate: dateOnly(t.startDate),
    dueDate: dateOnly(t.dueDate),
    progressPct: t.progressPct,
    progressManual: t.progressManual,
    recurring: t.recurringTemplateId !== null,
    tags: t.tags,
    subtasks: t.subtasks.map(serializeSubtask),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export function serializeSubtask(s: {
  id: string;
  title: string;
  completed: boolean;
  position: number;
}) {
  return { id: s.id, title: s.title, completed: s.completed, position: s.position };
}

interface ProjectRow {
  id: string;
  name: string;
  code: string;
  clientName: string | null;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
  status: { id: string; name: string; color: string };
  projectLead: { id: string; name: string | null } | null;
  _count?: { tasks: number };
}

export function serializeProject(p: ProjectRow) {
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    status: { id: p.status.id, name: p.status.name, color: p.status.color },
    clientName: p.clientName,
    projectLead: p.projectLead ? { id: p.projectLead.id, name: p.projectLead.name } : null,
    startDate: dateOnly(p.startDate),
    endDate: dateOnly(p.endDate),
    ...(p._count !== undefined && { taskCount: p._count.tasks }),
    createdAt: p.createdAt.toISOString(),
  };
}

export function serializeComment(c: {
  id: string;
  body: string;
  createdAt: Date;
  author: { id: string; name: string | null } | null;
}) {
  return {
    id: c.id,
    body: c.body,
    author: c.author, // null = author account was deleted
    createdAt: c.createdAt.toISOString(),
  };
}

export function serializeTag(t: {
  id: string;
  name: string;
  color: string;
  _count?: { tasks: number };
}) {
  return {
    id: t.id,
    name: t.name,
    color: t.color,
    ...(t._count !== undefined && { taskCount: t._count.tasks }),
  };
}
