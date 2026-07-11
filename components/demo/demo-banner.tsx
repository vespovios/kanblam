"use client";

import { useState } from "react";
import { X } from "lucide-react";

/** Bottom-of-viewport warning shown inside the app on DEMO_MODE
 *  deployments (rendered by the (app) layout). Dismissible per page load —
 *  it survives client-side navigation (layout state persists) and honestly
 *  reappears on a full reload, Vikunja-demo style. */
export function DemoBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-3 bg-destructive px-4 py-2.5 text-center text-sm font-medium text-white"
    >
      <span>
        This is a demo workspace — don&apos;t keep real data here.{" "}
        <strong className="font-bold uppercase">
          Everything is deleted at regular intervals!
        </strong>
      </span>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss demo warning"
        className="shrink-0 rounded p-1 transition-colors hover:bg-white/20"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
