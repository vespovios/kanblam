import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWritableWorkspace, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { updateWorkingDaysSchema } from "@/lib/validators/workspace-settings";
import { notifyWorkspace } from "@/lib/realtime/notify";

export async function PATCH(req: Request) {
  try {
    const ctx = await requireWritableWorkspace({ admin: true });
    const body = await req.json().catch(() => null);
    const parsed = updateWorkingDaysSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    await prisma.workspace.update({
      where: { id: ctx.workspaceId },
      data: { workingDays: parsed.data.workingDays },
    });
    await notifyWorkspace(ctx.workspaceId, "working_days");
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
