import { NextResponse } from "next/server";
import { requireWorkspaceContext, requireWritableWorkspace, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { createRecurringTaskSchema } from "@/lib/validators/recurring-task";
import { createTemplate, listTemplates, generateInstances } from "@/lib/recurring/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

const LOOKAHEAD_DAYS = 30;

export async function GET() {
  try {
    const ctx = await requireWorkspaceContext();
    const templates = await listTemplates(ctx.workspaceId);
    return NextResponse.json({ templates });
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
    const parsed = createRecurringTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    // Default assignee to the requesting user when not supplied. Mirrors the
    // POST /api/tasks behavior so generated instances inherit a non-null
    // assignee — keeps the swimlanes "no Unassigned lane" invariant honest
    // for tasks materialized from recurring templates too. Recurring form
    // still exposes an Unassigned option in the UI; the API normalizes here.
    const data = parsed.data.assigneeId
      ? parsed.data
      : { ...parsed.data, assigneeId: ctx.userId };
    const template = await createTemplate(ctx.workspaceId, ctx.userId, data);
    if (!template) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    // Materialize the first batch of instances so the user sees a task immediately.
    // Wrapped in try/catch so a transient generation failure doesn't strand the
    // template behind a 500 — the user can re-trigger generation later.
    try {
      await generateInstances(ctx.workspaceId, template.id, new Date(), LOOKAHEAD_DAYS);
    } catch (e) {
      console.error("generateInstances failed after template create", { templateId: template.id, error: e });
    }
    await notifyWorkspace(ctx.workspaceId, "recurring_templates");
    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
