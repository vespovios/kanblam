import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";
import { createHoliday, listHolidays, deleteHoliday } from "@/lib/holidays/service";

const prisma = new PrismaClient();
let seed: SeededWorkspace;

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("holidays service", () => {
  it("creates and lists holidays scoped to workspace", async () => {
    const h = await createHoliday(seed.workspaceId, { name: "Christmas", date: "2026-12-25" });
    expect(h).not.toBeNull();

    const other = await prisma.workspace.create({ data: { name: "Other" } });
    await prisma.holiday.create({
      data: { workspaceId: other.id, name: "Other Day", date: new Date("2026-06-01") },
    });

    const list = await listHolidays(seed.workspaceId);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Christmas");
  });

  it("rejects duplicate dates in the same workspace", async () => {
    await createHoliday(seed.workspaceId, { name: "A", date: "2026-12-25" });
    const second = await createHoliday(seed.workspaceId, { name: "B", date: "2026-12-25" });
    expect(second).toBeNull();
  });

  it("deletes a holiday by id within workspace", async () => {
    const h = await createHoliday(seed.workspaceId, { name: "New Year", date: "2026-01-01" });
    expect(h).not.toBeNull();
    const ok = await deleteHoliday(seed.workspaceId, h!.id);
    expect(ok).toBe(true);
    expect(await listHolidays(seed.workspaceId)).toHaveLength(0);
  });

  it("refuses to delete a holiday from a different workspace", async () => {
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    const h = await prisma.holiday.create({
      data: { workspaceId: other.id, name: "Other", date: new Date("2026-06-01") },
    });
    const ok = await deleteHoliday(seed.workspaceId, h.id);
    expect(ok).toBe(false);
  });
});
