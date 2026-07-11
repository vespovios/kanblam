import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { serializeTask } from "@/lib/api/serialize";
import { createTaskSchema } from "@/lib/validators/task";
import { createTask, listTasksPage } from "@/lib/tasks/service";
import { pickDefaultPriorityId } from "@/lib/tasks/defaults";
import { notifyWorkspace } from "@/lib/realtime/notify";
import { listTasksQuerySchema } from "@/lib/validators/api-task-query";



/** GET /api/v1/tasks — filterable, cursor-paginated task listing. */
export const GET = apiHandler("read", async (req, ctx) => {
  const url = new URL(req.url);
  const query = listTasksQuerySchema.parse(Object.fromEntries(url.searchParams));

  if (query.cursor) {
    // Unknown/foreign cursors would make Prisma page from nowhere; reject
    // them explicitly (cross-workspace ids indistinguishable from unknown).
    const known = await prisma.task.count({
      where: { id: query.cursor, workspaceId: ctx.workspaceId },
    });
    if (known === 0) throw new ApiError("invalid_request", "Unknown cursor.");
  }

  const { tasks, nextCursor } = await listTasksPage(
    ctx.workspaceId,
    {
      projectId: query.projectId,
      assigneeId: query.assigneeId,
      stageId: query.stageId,
      quadrant: query.quadrant,
      tagIds: query.tags ? query.tags.split(",").filter(Boolean) : undefined,
      q: query.q,
      hideCompleted: query.hideCompleted === "true",
    },
    { cursor: query.cursor, limit: query.limit },
  );

  return NextResponse.json({ tasks: tasks.map(serializeTask), nextCursor });
});

/** POST /api/v1/tasks — create a task. Ergonomic defaults for API clients:
 *  omitted priority falls back to the workspace's Medium, omitted stage to
 *  the first (lowest-order) non-terminal stage. */
export const POST = apiHandler("write", async (req, ctx) => {
  const raw = (await req.json().catch(() => null)) ?? {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ApiError("invalid_request", "Body must be a JSON object.");
  }
  const body: Record<string, unknown> = { ...raw };

  if (!body.priorityId) {
    const priorities = await prisma.priority.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: { id: true, name: true },
    });
    body.priorityId = pickDefaultPriorityId(priorities);
  }
  if (!body.kanbanStageId) {
    const stage = await prisma.kanbanStage.findFirst({
      where: { workspaceId: ctx.workspaceId, isTerminal: false },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    if (!stage) throw new ApiError("internal", "Workspace has no non-terminal stages.");
    body.kanbanStageId = stage.id;
  }

  const input = createTaskSchema.parse(body);
  const task = await createTask(ctx.workspaceId, {
    ...input,
    // Match the app's behaviour: unassigned tasks default to the caller.
    assigneeId: input.assigneeId ?? ctx.userId,
  });
  if (!task) throw new ApiError("not_found", "Project not found.");
  // Same realtime fan-out as the app: open boards see agent-created tasks live.
  await notifyWorkspace(ctx.workspaceId, "tasks");
  return NextResponse.json({ task: serializeTask(task) }, { status: 201 });
});
