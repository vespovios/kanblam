import { NextResponse } from "next/server";
import { requireWorkspaceContext, requireWritableWorkspace, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { updateTaskSchema } from "@/lib/validators/task";
import { recurrenceRuleSchema } from "@/lib/validators/recurring-task";
import { getTask, updateTask, deleteTask } from "@/lib/tasks/service";
import {
  editRecurringSeries,
  deleteRecurringSeries,
} from "@/lib/tasks/recurring-scope";
import { notifyWorkspace } from "@/lib/realtime/notify";

type Ctx = { params: Promise<{ id: string }> };

/** Recurrence scope — how far an edit/delete on a recurring task reaches. */
function parseScope(raw: unknown): "this" | "following" | "all" {
  return raw === "following" || raw === "all" ? raw : "this";
}

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const ctx = await requireWorkspaceContext();
    const task = await getTask(ctx.workspaceId, id);
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ task });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const ctx = await requireWritableWorkspace();
    const body = await req.json().catch(() => null);
    // `scope` + `recurrence` ride alongside the task fields for recurring
    // edits; peel them off before validating the rest as a task update.
    const scope = parseScope(body?.scope);
    const rawRecurrence = body?.recurrence;
    const taskBody =
      body && typeof body === "object"
        ? (() => {
            const { scope: _s, recurrence: _r, ...rest } = body;
            void _s;
            void _r;
            return rest;
          })()
        : body;

    const parsed = updateTaskSchema.safeParse(taskBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // --- scope: this (default) — a plain single-task edit ---
    if (scope === "this") {
      const task = await updateTask(ctx.workspaceId, id, parsed.data);
      if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
      await notifyWorkspace(ctx.workspaceId, "tasks");
      return NextResponse.json({ task });
    }

    // --- scope: following | all — a series-level edit ---
    const recurrence = recurrenceRuleSchema.safeParse(rawRecurrence);
    if (!recurrence.success) {
      return NextResponse.json(
        { error: "Invalid recurrence", details: recurrence.error.flatten() },
        { status: 400 },
      );
    }
    const ok = await editRecurringSeries(
      ctx.workspaceId,
      id,
      scope,
      {
        name: parsed.data.name,
        description: parsed.data.description,
        priorityId: parsed.data.priorityId,
        kanbanStageId: parsed.data.kanbanStageId,
        assigneeId: parsed.data.assigneeId,
        tagIds: parsed.data.tagIds,
        isImportant: parsed.data.isImportant,
        isUrgent: parsed.data.isUrgent,
      },
      recurrence.data,
    );
    if (!ok) {
      return NextResponse.json(
        { error: "Not a recurring task" },
        { status: 404 },
      );
    }
    await notifyWorkspace(ctx.workspaceId, "tasks");
    await notifyWorkspace(ctx.workspaceId, "recurring_templates");
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const ctx = await requireWritableWorkspace();
    // Scope rides on the query string — DELETE carries no body by convention.
    const scope = parseScope(new URL(req.url).searchParams.get("scope"));

    if (scope === "this") {
      const ok = await deleteTask(ctx.workspaceId, id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      await notifyWorkspace(ctx.workspaceId, "tasks");
      return NextResponse.json({ ok: true });
    }

    const ok = await deleteRecurringSeries(ctx.workspaceId, id, scope);
    if (!ok) {
      return NextResponse.json(
        { error: "Not a recurring task" },
        { status: 404 },
      );
    }
    await notifyWorkspace(ctx.workspaceId, "tasks");
    await notifyWorkspace(ctx.workspaceId, "recurring_templates");
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
