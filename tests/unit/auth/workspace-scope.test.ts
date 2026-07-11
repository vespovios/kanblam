import { describe, it, expect, vi } from "vitest";
import { requireWorkspaceContext, WorkspaceAuthError } from "@/lib/auth/workspace-scope";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));
import { auth } from "@/auth";

describe("requireWorkspaceContext", () => {
  it("returns context for an authenticated user", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", email: "a@b.com", workspaceId: "ws1", role: "MEMBER" },
      expires: new Date().toISOString(),
    } as any);

    const ctx = await requireWorkspaceContext();
    expect(ctx).toEqual({ userId: "u1", workspaceId: "ws1", role: "MEMBER" });
  });

  it("throws WorkspaceAuthError with status 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    await expect(requireWorkspaceContext()).rejects.toMatchObject({
      name: "WorkspaceAuthError",
      status: 401,
    });
  });

  it("throws WorkspaceAuthError with status 401 when session lacks workspaceId", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", email: "a@b.com", role: "MEMBER" },
      expires: new Date().toISOString(),
    } as any);
    await expect(requireWorkspaceContext()).rejects.toMatchObject({
      name: "WorkspaceAuthError",
      status: 401,
    });
  });
});
