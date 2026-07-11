import { NextResponse } from "next/server";
import { requireWorkspaceContext, requireWritableWorkspace, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { createHolidaySchema } from "@/lib/validators/holiday";
import { createHoliday, listHolidays } from "@/lib/holidays/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

export async function GET() {
  try {
    const ctx = await requireWorkspaceContext();
    const holidays = await listHolidays(ctx.workspaceId);
    return NextResponse.json({ holidays });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireWritableWorkspace({ admin: true });
    const body = await req.json().catch(() => null);
    const parsed = createHolidaySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const holiday = await createHoliday(ctx.workspaceId, parsed.data);
    if (!holiday) {
      return NextResponse.json({ error: "A holiday already exists on that date" }, { status: 409 });
    }
    await notifyWorkspace(ctx.workspaceId, "holidays");
    return NextResponse.json({ holiday }, { status: 201 });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
