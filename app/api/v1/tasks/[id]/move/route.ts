import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { serializeTask } from "@/lib/api/serialize";
import { moveTaskSchema } from "@/lib/validators/task-move";
import { moveTask, getTask } from "@/lib/tasks/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

/** POST /api/v1/tasks/[id]/move — move a task to a kanban stage (optionally
 *  to a specific position in the column). The board-native mutation: this is
 *  what "the agent moved the card" means. */
export const POST = apiHandler("write", async (req, ctx, extra) => {
  const { id } = await extra.params;
  const body = await req.json().catch(() => null);
  const input = moveTaskSchema.parse(body ?? {});
  const moved = await moveTask(ctx.workspaceId, id, input);
  if (!moved) throw new ApiError("not_found", "Task not found.");
  await notifyWorkspace(ctx.workspaceId, "tasks");
  const task = await getTask(ctx.workspaceId, id);
  return NextResponse.json({ task: task ? serializeTask(task) : null });
});
