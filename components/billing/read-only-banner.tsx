import Link from "next/link";
import type { WorkspaceAccessLevel } from "@/lib/billing/entitlements";

interface Props {
  accessLevel: WorkspaceAccessLevel;
}

/**
 * App-wide, non-dismissible banner shown above every authenticated page when the
 * workspace's hosted subscription has lapsed (`read-only`) or been suspended.
 *
 * Renders **nothing** for the `full` access level — the overwhelmingly common
 * case (self-host, and every active/trialing/past-due workspace). No feature is
 * hidden by this banner; it only explains the read-only state and links to
 * Settings → Billing to reactivate. The load-bearing enforcement is the
 * server-side 402 on every write route.
 */
export function ReadOnlyBanner({ accessLevel }: Props) {
  if (accessLevel === "full") return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-center text-sm text-destructive"
    >
      <span>
        This workspace is <strong>read-only</strong> — its hosted subscription
        has lapsed. Your data is safe, but changes are disabled until you
        reactivate.
      </span>
      <Link
        href="/settings/billing"
        className="font-medium underline underline-offset-4 hover:no-underline"
      >
        Reactivate
      </Link>
    </div>
  );
}
