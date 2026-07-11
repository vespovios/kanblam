import type { CreateTaskInput } from "@/lib/validators/task";
import type { ParsedQuickAdd } from "./parse";
import { resolveDueKeyword } from "./dates";

export type ResolveContext = {
  projects: { id: string; code: string }[];
  tags: { id: string; name: string }[];
  members: { id: string; name: string | null; email: string }[];
  /** All workspace priorities — used to resolve `!low`/`!med`/`!high` tokens. */
  priorities: { id: string; name: string }[];
  defaultProjectId: string | null;
  defaultPriorityId: string;
  defaultKanbanStageId: string;
  currentUserId: string;
  now: Date;
};

/** Map a normalized priority keyword to candidate priority names to look for
 *  in the workspace's priority list (case-insensitive). The first match wins. */
function priorityKeywordCandidates(keyword: string): string[] {
  switch (keyword) {
    case "low":
      return ["low"];
    case "med":
      return ["medium", "med"];
    case "high":
      return ["high"];
    default:
      return [];
  }
}

export type ResolveResult =
  | { ok: true; payload: CreateTaskInput; autoCreateTagNames: string[] }
  | { ok: false; errors: string[] };

function emailPrefix(email: string): string {
  const at = email.indexOf("@");
  return at === -1 ? email : email.slice(0, at);
}

export function resolveQuickAdd(parsed: ParsedQuickAdd, ctx: ResolveContext): ResolveResult {
  const errors: string[] = [...parsed.errors];

  // ── project ───────────────────────────────────────────────────────────────
  let projectId: string | null = null;
  if (parsed.projectCode) {
    const wanted = parsed.projectCode.toLowerCase();
    const found = ctx.projects.find((p) => p.code.toLowerCase() === wanted);
    if (found) projectId = found.id;
    else errors.push(`Unknown project [${parsed.projectCode}]`);
  } else if (ctx.defaultProjectId) {
    projectId = ctx.defaultProjectId;
  } else {
    errors.push("No projects yet — create one first");
  }

  // ── tags ──────────────────────────────────────────────────────────────────
  const tagIds: string[] = [];
  const autoCreateTagNames: string[] = [];
  for (const name of parsed.tagNames) {
    const lower = name.toLowerCase();
    const existing = ctx.tags.find((t) => t.name.toLowerCase() === lower);
    if (existing) {
      tagIds.push(existing.id);
    } else {
      autoCreateTagNames.push(name);
    }
  }

  // ── due date ──────────────────────────────────────────────────────────────
  let dueDate: string | undefined;
  if (parsed.dueDateKeyword) {
    const resolved = resolveDueKeyword(parsed.dueDateKeyword, ctx.now);
    if (resolved) dueDate = resolved.toISOString();
    else errors.push(`Invalid date '${parsed.dueDateKeyword}'`);
  }

  // ── assignee ──────────────────────────────────────────────────────────────
  let assigneeId: string | undefined = ctx.currentUserId;
  if (parsed.assigneeToken) {
    const token = parsed.assigneeToken.toLowerCase();
    const candidates = ctx.members.filter((m) => {
      const nameHit = m.name?.toLowerCase().includes(token) ?? false;
      const emailHit = emailPrefix(m.email).toLowerCase().includes(token);
      return nameHit || emailHit;
    });
    if (candidates.length === 0) {
      errors.push(`No member matching @${parsed.assigneeToken}`);
      assigneeId = undefined;
    } else if (candidates.length > 1) {
      const list = candidates.map((m) => `@${emailPrefix(m.email)}`).join(", ");
      errors.push(`Ambiguous @${parsed.assigneeToken} — try ${list}`);
      assigneeId = undefined;
    } else {
      assigneeId = candidates[0].id;
    }
  }

  // ── priority ──────────────────────────────────────────────────────────────
  // `!low` / `!med` / `!high` overrides the workspace default. Unknown
  // keywords fall through to the default rather than blocking the parse;
  // this is forgiving by design (the unknown token has already been
  // stripped from the title above).
  let priorityId: string = ctx.defaultPriorityId;
  if (parsed.priorityKeyword) {
    const candidates = priorityKeywordCandidates(parsed.priorityKeyword);
    const match = ctx.priorities.find((p) =>
      candidates.includes(p.name.toLowerCase()),
    );
    if (match) {
      priorityId = match.id;
    } else {
      errors.push(
        `No priority matching !${parsed.priorityKeyword} — using default`,
      );
    }
  }

  if (errors.length > 0 || projectId === null) {
    return { ok: false, errors };
  }

  const payload: CreateTaskInput = {
    projectId,
    name: parsed.name,
    priorityId,
    kanbanStageId: ctx.defaultKanbanStageId,
    isImportant: parsed.isImportant,
    isUrgent: parsed.isUrgent,
    tagIds, // will be extended by the palette after auto-creating tags
    ...(dueDate ? { dueDate } : {}),
    ...(assigneeId ? { assigneeId } : {}),
  };

  return { ok: true, payload, autoCreateTagNames };
}
