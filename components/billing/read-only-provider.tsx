"use client";

import { createContext, useContext } from "react";

/**
 * App-wide read-only flag, derived once in the authenticated layout from the
 * workspace's billing entitlement and provided to client components that own a
 * mutation control (Quick Add, edit buttons, drag-to-move) so they can disable
 * themselves with an explanatory tooltip.
 *
 * This is a **UI affordance only** — the load-bearing enforcement is the
 * server-side 402 from `requireWritableWorkspace` on every write route. The flag
 * is `false` on self-host and any active workspace, so the default context value
 * keeps every control fully interactive unless billing explicitly says read-only.
 */
const ReadOnlyContext = createContext<boolean>(false);

export function ReadOnlyProvider({
  readOnly,
  children,
}: {
  readOnly: boolean;
  children: React.ReactNode;
}) {
  return (
    <ReadOnlyContext.Provider value={readOnly}>
      {children}
    </ReadOnlyContext.Provider>
  );
}

/** True when the current workspace is read-only/suspended under billing. */
export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}

/** Shared tooltip/title copy for a disabled mutation control. */
export const READ_ONLY_CONTROL_TITLE =
  "This workspace is read-only — its hosted subscription has lapsed. Reactivate in Settings → Billing to make changes.";
