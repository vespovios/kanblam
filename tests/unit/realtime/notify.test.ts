import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { $executeRawUnsafe: vi.fn() },
}));

import { prisma } from "@/lib/db";
import { notifyWorkspace } from "@/lib/realtime/notify";

describe("notifyWorkspace", () => {
  beforeEach(() => {
    vi.mocked(prisma.$executeRawUnsafe).mockReset();
    vi.mocked(prisma.$executeRawUnsafe).mockResolvedValue(0);
  });

  it("issues NOTIFY on workspace_changes with the right payload", async () => {
    await notifyWorkspace("ws_abc", "tasks");
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const sql = vi.mocked(prisma.$executeRawUnsafe).mock.calls[0][0] as string;
    expect(sql).toContain("NOTIFY workspace_changes");
    expect(sql).toContain('"workspaceId":"ws_abc"');
    expect(sql).toContain('"kind":"tasks"');
  });

  it("escapes single quotes in the payload (defensive)", async () => {
    await notifyWorkspace("ws'with'quotes", "tasks");
    const sql = vi.mocked(prisma.$executeRawUnsafe).mock.calls[0][0] as string;
    // SQL string literals double the quote: ' -> ''. Verify the doubled form appears.
    expect(sql).toContain("ws''with''quotes");
  });

  it("swallows errors so a notify failure never breaks the caller", async () => {
    vi.mocked(prisma.$executeRawUnsafe).mockRejectedValueOnce(new Error("PG down"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(notifyWorkspace("ws_abc", "tasks")).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
