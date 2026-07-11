import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/realtime/listener", () => ({
  subscribe: vi.fn(),
}));

import { auth } from "@/auth";
import { subscribe } from "@/lib/realtime/listener";

describe("GET /api/realtime", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
    vi.mocked(subscribe).mockReset();
    vi.mocked(subscribe).mockResolvedValue(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 when there is no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const { GET } = await import("@/app/api/realtime/route");
    const req = new Request("http://x/api/realtime", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("returns a text/event-stream and subscribes the writer", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", email: "u@x", workspaceId: "ws_abc", role: "MEMBER" },
    } as never);
    const { GET } = await import("@/app/api/realtime/route");
    const req = new Request("http://x/api/realtime", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    // Read the first chunk to drive the start() body to completion.
    const reader = res.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain(": connected");
    expect(subscribe).toHaveBeenCalledWith("ws_abc", expect.any(Function));
    // Cleanup: cancel the stream.
    await reader.cancel();
  });
});
