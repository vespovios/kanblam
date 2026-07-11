import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";
import {
  bulkCreateHolidays,
  setWorkspaceHolidayRegion,
  listHolidays,
} from "@/lib/holidays/service";

const prisma = new PrismaClient();
let seed: SeededWorkspace;

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("bulkCreateHolidays", () => {
  it("inserts many holidays and reports the imported count", async () => {
    const res = await bulkCreateHolidays(seed.workspaceId, [
      { name: "New Year's Day", date: "2026-01-01" },
      { name: "Christmas Day", date: "2026-12-25" },
      { name: "Boxing Day", date: "2026-12-26" },
    ]);
    expect(res).toEqual({ imported: 3, skipped: 0 });
    expect(await listHolidays(seed.workspaceId)).toHaveLength(3);
  });

  it("skips colliding dates and NEVER clobbers an existing manual entry", async () => {
    await prisma.holiday.create({
      data: { workspaceId: seed.workspaceId, name: "My Custom Xmas", date: new Date("2026-12-25T00:00:00Z") },
    });

    const res = await bulkCreateHolidays(seed.workspaceId, [
      { name: "Christmas Day", date: "2026-12-25" },
      { name: "Boxing Day", date: "2026-12-26" },
    ]);

    expect(res).toEqual({ imported: 1, skipped: 1 });
    const list = await listHolidays(seed.workspaceId);
    const xmas = list.find((h) => h.date.toISOString().slice(0, 10) === "2026-12-25");
    expect(xmas!.name).toBe("My Custom Xmas");
  });

  it("returns zero counts for an empty list", async () => {
    expect(await bulkCreateHolidays(seed.workspaceId, [])).toEqual({ imported: 0, skipped: 0 });
  });

  it("is scoped to the workspace (does not leak across tenants)", async () => {
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    await bulkCreateHolidays(seed.workspaceId, [{ name: "X", date: "2026-05-01" }]);
    expect(await listHolidays(other.id)).toHaveLength(0);
  });
});

describe("setWorkspaceHolidayRegion", () => {
  it("persists country + subdivision on the workspace", async () => {
    await setWorkspaceHolidayRegion(seed.workspaceId, "GB", "eng");
    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { id: seed.workspaceId },
      select: { holidayCountry: true, holidaySubdivision: true },
    });
    expect(ws).toEqual({ holidayCountry: "GB", holidaySubdivision: "eng" });
  });

  it("stores null subdivision for a country-level selection", async () => {
    await setWorkspaceHolidayRegion(seed.workspaceId, "AU", null);
    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { id: seed.workspaceId },
      select: { holidayCountry: true, holidaySubdivision: true },
    });
    expect(ws).toEqual({ holidayCountry: "AU", holidaySubdivision: null });
  });
});
