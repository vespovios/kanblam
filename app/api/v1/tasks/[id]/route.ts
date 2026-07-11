import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { serializeTask } from "@/lib/api/serialize";
import { updateTaskSchema } from "@/lib/validators/task";
import { getTask, updateTask, deleteTask } from "@/lib/tasks/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

/** GET /api/v1/tasks/[id] */
export const GET = apiHandler("read", async (_req, ctx, extra) => {
  const { id } = await extra.params;
  const task = await getTask(ctx.workspaceId, id);
  if (!task) throw new ApiError("not_found", "Task not found.");
  return NextResponse.json({ task: serializeTask(task) });
});

/** PATCH /api/v1/tasks/[id] — partial update. For recurring instances this
 *  edits THIS occurrence only; series editing (this-and-following / all)
 *  is not part of API v1. */
export const PATCH = apiHandler("write", async (req, ctx, extra) => {
  const { id } = await extra.params;
  const body = await req.json().catch(() => null);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError("invalid_request", "Body must be a JSON object.");
  }
  const input = updateTaskSchema.parse(body);
  const task = await updateTask(ctx.workspaceId, id, input);
  if (!task) {
    // Also the shape of "assignee/project not in this workspace" — the
    // service treats those as not-found, and so do we: no existence leaks.
    throw new ApiError("not_found", "Task not found.");
  }
  await notifyWorkspace(ctx.workspaceId, "tasks");
  return NextResponse.json({ task: serializeTask(task) });
});

/** DELETE /api/v1/tasks/[id] — deletes this task (for recurring instances:
 *  this occurrence only). */
export const DELETE = apiHandler("write", async (_req, ctx, extra) => {
  const { id } = await extra.params;
  const deleted = await deleteTask(ctx.workspaceId, id);
  if (!deleted) throw new ApiError("not_found", "Task not found.");
  await notifyWorkspace(ctx.workspaceId, "tasks");
  return NextResponse.json({ ok: true });
});
