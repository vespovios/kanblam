import { describe, it, expect } from "vitest";

describe("GET /api/health", () => {
  it("returns 200 with { ok: true }", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("declares nodejs runtime + force-dynamic", async () => {
    const mod = await import("@/app/api/health/route");
    expect(mod.runtime).toBe("nodejs");
    expect(mod.dynamic).toBe("force-dynamic");
  });
});
