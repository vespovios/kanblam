import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { serializeSubtask } from "@/lib/api/serialize";
import { createSubtaskSchema } from "@/lib/validators/subtask";
import { listSubtasks, createSubtask } from "@/lib/subtasks/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

/** GET /api/v1/tasks/[id]/subtasks */
export const GET = apiHandler("read", async (_req, ctx, extra) => {
  const { id } = await extra.params;
  const subtasks = await listSubtasks(ctx.workspaceId, id);
  if (subtasks === null) throw new ApiError("not_found", "Task not found.");
  return NextResponse.json({ subtasks: subtasks.map(serializeSubtask) });
});

/** POST /api/v1/tasks/[id]/subtasks — append a checklist item. Parent task
 *  progress recomputes automatically (unless progress is manual). */
export const POST = apiHandler("write", async (req, ctx, extra) => {
  const { id } = await extra.params;
  const body = await req.json().catch(() => null);
  const input = createSubtaskSchema.parse(body ?? {});
  let subtask;
  try {
    subtask = await createSubtask(ctx.workspaceId, id, input);
  } catch (err) {
    // service throws on the per-task cap
    const message = err instanceof Error ? err.message : "Failed to create subtask";
    throw new ApiError("invalid_request", message);
  }
  if (!subtask) throw new ApiError("not_found", "Task not found.");
  await notifyWorkspace(ctx.workspaceId, "tasks");
  return NextResponse.json({ subtask: serializeSubtask(subtask) }, { status: 201 });
});
