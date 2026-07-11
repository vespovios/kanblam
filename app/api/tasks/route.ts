import { NextResponse } from "next/server";
import { requireWorkspaceContext, requireWritableWorkspace, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { createTaskSchema } from "@/lib/validators/task";
import { createTask, listTasks } from "@/lib/tasks/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

export async function GET(req: Request) {
  try {
    const ctx = await requireWorkspaceContext();
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId") ?? undefined;
    const assigneeId = url.searchParams.get("assigneeId") ?? undefined;
    const hideCompleted = url.searchParams.get("hideCompleted") === "true";
    const tasks = await listTasks(ctx.workspaceId, { projectId, assigneeId, hideCompleted });
    return NextResponse.json({ tasks });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireWritableWorkspace();
    const body = await req.json().catch(() => null);
    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }
    // Default assignee to the requesting user when not supplied (defense-in-depth;
    // the create dialog + quick-add also default this on the client).
    const data = parsed.data.assigneeId
      ? parsed.data
      : { ...parsed.data, assigneeId: ctx.userId };
    const task = await createTask(ctx.workspaceId, data);
    if (!task) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    await notifyWorkspace(ctx.workspaceId, "tasks");
    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
