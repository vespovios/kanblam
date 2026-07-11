import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";

const prisma = new PrismaClient();
let seed: SeededWorkspace;

function asAdmin() {
  vi.mocked(auth).mockResolvedValue({
    user: { id: seed.adminId, email: "admin@test.local", workspaceId: seed.workspaceId, role: "ADMIN" },
    expires: new Date(Date.now() + 86400_000).toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}
function asMember() {
  vi.mocked(auth).mockResolvedValue({
    user: { id: seed.memberId, email: "member@test.local", workspaceId: seed.workspaceId, role: "MEMBER" },
    expires: new Date(Date.now() + 86400_000).toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
  asAdmin();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/holidays/import/options", () => {
  it("returns countries and (when country given) subdivisions", async () => {
    const { GET } = await import("@/app/api/holidays/import/options/route");
    const res = await GET(new Request("http://localhost/api/holidays/import/options?country=GB"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.countries.some((c: { code: string }) => c.code === "GB")).toBe(true);
    expect(body.subdivisions.some((s: { code: string }) => s.code === "eng")).toBe(true);
  });

  it("403 for non-admin", async () => {
    asMember();
    const { GET } = await import("@/app/api/holidays/import/options/route");
    const res = await GET(new Request("http://localhost/api/holidays/import/options"));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/holidays/import/preview", () => {
  it("flags dates that already exist in the workspace", async () => {
    await prisma.holiday.create({
      data: { workspaceId: seed.workspaceId, name: "Mine", date: new Date("2026-12-25T00:00:00Z") },
    });
    const { POST } = await import("@/app/api/holidays/import/preview/route");
    const res = await POST(
      new Request("http://localhost/api/holidays/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: "GB", subdivision: "eng", year: 2026 }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const xmas = body.candidates.find((c: { date: string }) => c.date === "2026-12-25");
    expect(xmas.exists).toBe(true);
    expect(body.candidates.some((c: { exists: boolean }) => c.exists === false)).toBe(true);
  });

  it("403 for non-admin", async () => {
    asMember();
    const { POST } = await import("@/app/api/holidays/import/preview/route");
    const res = await POST(
      new Request("http://localhost/api/holidays/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: "GB", subdivision: "eng", year: 2026 }),
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/holidays/import (commit)", () => {
  it("imports selected dates, skips collisions, persists region, returns rows", async () => {
    await prisma.holiday.create({
      data: { workspaceId: seed.workspaceId, name: "Mine", date: new Date("2026-12-25T00:00:00Z") },
    });
    const { POST } = await import("@/app/api/holidays/import/route");
    const res = await POST(
      new Request("http://localhost/api/holidays/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: "GB",
          subdivision: "eng",
          year: 2026,
          selectedDates: ["2026-12-25", "2026-12-26"],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.imported).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.holidays.length).toBe(2);
    const mine = body.holidays.find((h: { date: string }) => h.date === "2026-12-25");
    expect(mine.name).toBe("Mine");
    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { id: seed.workspaceId },
      select: { holidayCountry: true, holidaySubdivision: true },
    });
    expect(ws).toEqual({ holidayCountry: "GB", holidaySubdivision: "eng" });
  });

  it("ignores selected dates that aren't in the computed catalog", async () => {
    const { POST } = await import("@/app/api/holidays/import/route");
    const res = await POST(
      new Request("http://localhost/api/holidays/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: "GB",
          subdivision: "eng",
          year: 2026,
          selectedDates: ["2026-07-04"],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.imported).toBe(0);
  });

  it("403 for non-admin", async () => {
    asMember();
    const { POST } = await import("@/app/api/holidays/import/route");
    const res = await POST(
      new Request("http://localhost/api/holidays/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: "GB", year: 2026, selectedDates: ["2026-12-25"] }),
      }),
    );
    expect(res.status).toBe(403);
  });
});
