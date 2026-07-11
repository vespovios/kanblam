import { NextResponse } from "next/server";
import { requireWritableWorkspace, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { importCommitSchema } from "@/lib/validators/holiday";
import { computeHolidays } from "@/lib/holidays/catalog";
import { bulkCreateHolidays, setWorkspaceHolidayRegion } from "@/lib/holidays/service";
import { prisma } from "@/lib/db";
import { notifyWorkspace } from "@/lib/realtime/notify";

export async function POST(req: Request) {
  try {
    const ctx = await requireWritableWorkspace({ admin: true });
    const body = await req.json().catch(() => null);
    const parsed = importCommitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { country, subdivision, year, includeObservances, selectedDates } = parsed.data;

    const computed = computeHolidays(country, subdivision, year, includeObservances);
    const selected = new Set(selectedDates);
    const items = computed
      .filter((c) => selected.has(c.date))
      .map((c) => ({ name: c.name, date: c.date }));

    const { imported, skipped } = await bulkCreateHolidays(ctx.workspaceId, items);
    await setWorkspaceHolidayRegion(ctx.workspaceId, country, subdivision);

    const holidays = await prisma.holiday.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        date: { in: items.map((i) => new Date(i.date + "T00:00:00Z")) },
      },
      orderBy: { date: "asc" },
      select: { id: true, name: true, date: true },
    });

    if (imported > 0) await notifyWorkspace(ctx.workspaceId, "holidays");

    return NextResponse.json({
      imported,
      skipped,
      holidays: holidays.map((h) => ({
        id: h.id,
        name: h.name,
        date: h.date.toISOString().slice(0, 10),
      })),
    });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
