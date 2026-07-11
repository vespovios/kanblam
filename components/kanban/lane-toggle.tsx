"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { LaneAxis } from "@/lib/kanban/lanes";

const OPTIONS: { value: LaneAxis; label: string }[] = [
  { value: "none", label: "Stage" },
  { value: "assignee", label: "Assignee" },
  { value: "tag", label: "Tag" },
  { value: "project", label: "Project" },
];

export function LaneToggle({ value }: { value: LaneAxis }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function pick(next: LaneAxis) {
    const sp = new URLSearchParams(params.toString());
    if (next === "none") sp.delete("lane");
    else sp.set("lane", next);
    const qs = sp.toString();
    // router.push (not replace) so back-button undoes lane changes
    // alongside sibling filter controls in the global header strip.
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="inline-flex rounded-md border bg-muted p-0.5 text-xs">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => pick(opt.value)}
          className={cn(
            "px-2.5 py-1 rounded transition-colors",
            value === opt.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
