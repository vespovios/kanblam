import { NextResponse } from "next/server";
import { requireAdminContext, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { importPreviewSchema } from "@/lib/validators/holiday";
import { computeHolidays } from "@/lib/holidays/catalog";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const ctx = await requireAdminContext();
    const body = await req.json().catch(() => null);
    const parsed = importPreviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { country, subdivision, year, includeObservances } = parsed.data;
    const computed = computeHolidays(country, subdivision, year, includeObservances);

    const existing = await prisma.holiday.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        date: { in: computed.map((c) => new Date(c.date + "T00:00:00Z")) },
      },
      select: { date: true },
    });
    const existingDates = new Set(existing.map((e) => e.date.toISOString().slice(0, 10)));

    return NextResponse.json({
      candidates: computed.map((c) => ({ ...c, exists: existingDates.has(c.date) })),
    });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
