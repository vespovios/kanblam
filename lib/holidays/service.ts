import { prisma } from "@/lib/db";
import type { CreateHolidayInput } from "@/lib/validators/holiday";

export async function listHolidays(workspaceId: string) {
  return prisma.holiday.findMany({
    where: { workspaceId },
    orderBy: { date: "asc" },
    select: { id: true, name: true, date: true, createdAt: true },
  });
}

export async function createHoliday(workspaceId: string, input: CreateHolidayInput) {
  try {
    return await prisma.holiday.create({
      data: {
        workspaceId,
        name: input.name,
        date: new Date(input.date + "T00:00:00Z"),
      },
      select: { id: true, name: true, date: true, createdAt: true },
    });
  } catch {
    // Unique constraint on (workspaceId, date). Caller treats null as "duplicate".
    return null;
  }
}

export async function deleteHoliday(workspaceId: string, id: string): Promise<boolean> {
  const res = await prisma.holiday.deleteMany({ where: { id, workspaceId } });
  return res.count > 0;
}

/**
 * Bulk-insert holidays, skipping any whose date already exists in the
 * workspace. Relies on the @@unique([workspaceId, date]) index, so an existing
 * manual entry on a colliding date is left exactly as-is — we never clobber.
 */
export async function bulkCreateHolidays(
  workspaceId: string,
  items: { name: string; date: string }[],
): Promise<{ imported: number; skipped: number }> {
  if (items.length === 0) return { imported: 0, skipped: 0 };
  const res = await prisma.holiday.createMany({
    data: items.map((i) => ({
      workspaceId,
      name: i.name,
      date: new Date(i.date + "T00:00:00Z"),
    })),
    skipDuplicates: true,
  });
  return { imported: res.count, skipped: items.length - res.count };
}

/** Remember the workspace's last-used import region (pre-fills the importer). */
export async function setWorkspaceHolidayRegion(
  workspaceId: string,
  country: string,
  subdivision: string | null,
): Promise<void> {
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { holidayCountry: country, holidaySubdivision: subdivision },
  });
}
