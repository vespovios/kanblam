import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  permanentRedirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

import { permanentRedirect } from "next/navigation";

describe("GET /today", () => {
  beforeEach(() => {
    vi.mocked(permanentRedirect).mockClear();
  });

  it("permanently redirects to /dashboard", async () => {
    const Page = (await import("@/app/(app)/today/page")).default;
    // Swallow whatever the page throws — for the new page that's the mocked
    // NEXT_REDIRECT; for the old (async) page it's whatever requireUser /
    // prisma error fired first. Either way the contract we care about is
    // captured in the mock-call assertions below.
    try {
      await Page();
    } catch {
      // expected
    }
    expect(permanentRedirect).toHaveBeenCalledTimes(1);
    expect(permanentRedirect).toHaveBeenCalledWith("/dashboard");
  });
});
