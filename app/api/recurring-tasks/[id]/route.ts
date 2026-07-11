import { NextResponse } from "next/server";
import { requireWorkspaceContext, requireWritableWorkspace, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { updateRecurringTaskSchema } from "@/lib/validators/recurring-task";
import { getTemplate, updateTemplate, deleteTemplate } from "@/lib/recurring/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const ctx = await requireWorkspaceContext();
    const template = await getTemplate(ctx.workspaceId, id);
    if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ template });
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
    const parsed = updateRecurringTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const template = await updateTemplate(ctx.workspaceId, id, parsed.data);
    if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await notifyWorkspace(ctx.workspaceId, "recurring_templates");
    return NextResponse.json({ template });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const ctx = await requireWritableWorkspace();
    const ok = await deleteTemplate(ctx.workspaceId, id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await notifyWorkspace(ctx.workspaceId, "recurring_templates");
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
