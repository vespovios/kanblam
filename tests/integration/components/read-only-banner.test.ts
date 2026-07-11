import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkspaceAccessLevel } from "@/lib/billing/entitlements";

// Stub next/link to a plain anchor so the banner renders without an App Router
// runtime context (same approach as the checkout-success-view test).
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: unknown }) =>
    createElement("a", { href }, children as never),
}));

import { ReadOnlyBanner } from "@/components/billing/read-only-banner";

const render = (accessLevel: WorkspaceAccessLevel) =>
  renderToStaticMarkup(createElement(ReadOnlyBanner, { accessLevel }));

describe("ReadOnlyBanner — across access levels", () => {
  it("renders nothing for the full access level", () => {
    expect(render("full")).toBe("");
  });

  it.each<WorkspaceAccessLevel>(["read-only", "suspended"])(
    "renders the read-only banner for %s",
    (level) => {
      const html = render(level);
      expect(html).not.toBe("");
      expect(html).toContain("read-only");
      expect(html).toContain('href="/settings/billing"');
      expect(html).toContain("Reactivate");
    },
  );
});
