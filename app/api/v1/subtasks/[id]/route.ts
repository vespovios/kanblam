import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { serializeSubtask } from "@/lib/api/serialize";
import { updateSubtaskSchema } from "@/lib/validators/subtask";
import { updateSubtask, deleteSubtask } from "@/lib/subtasks/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

/** PATCH /api/v1/subtasks/[id] — retitle and/or (un)complete. Completion
 *  changes recompute the parent task's progress. */
export const PATCH = apiHandler("write", async (req, ctx, extra) => {
  const { id } = await extra.params;
  const body = await req.json().catch(() => null);
  const input = updateSubtaskSchema.parse(body ?? {});
  const subtask = await updateSubtask(ctx.workspaceId, id, input);
  if (!subtask) throw new ApiError("not_found", "Subtask not found.");
  await notifyWorkspace(ctx.workspaceId, "tasks");
  return NextResponse.json({ subtask: serializeSubtask(subtask) });
});

/** DELETE /api/v1/subtasks/[id] */
export const DELETE = apiHandler("write", async (_req, ctx, extra) => {
  const { id } = await extra.params;
  const deleted = await deleteSubtask(ctx.workspaceId, id);
  if (!deleted) throw new ApiError("not_found", "Subtask not found.");
  await notifyWorkspace(ctx.workspaceId, "tasks");
  return NextResponse.json({ ok: true });
});
