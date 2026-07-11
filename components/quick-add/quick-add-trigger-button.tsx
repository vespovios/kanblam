"use client";

import { Plus } from "lucide-react";
import { useQuickAdd } from "./quick-add-provider";
import { useReadOnly, READ_ONLY_CONTROL_TITLE } from "@/components/billing/read-only-provider";

/**
 * Quick-add launcher rendered in the header band. Solid primary pill —
 * the single brand accent (muted slate-blue) — so it's the one clearly
 * actionable element in an otherwise calm header.
 */
export function QuickAddTriggerButton() {
  const { open } = useQuickAdd();
  const readOnly = useReadOnly();
  return (
    <button
      type="button"
      onClick={open}
      disabled={readOnly}
      className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-sm font-medium
                 bg-primary text-primary-foreground hover:brightness-110
                 shadow-sm hover:shadow transition-[filter,box-shadow]
                 disabled:opacity-50 disabled:pointer-events-none
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--header-bg)]"
      title={readOnly ? READ_ONLY_CONTROL_TITLE : "Quick add task"}
      aria-keyshortcuts="Meta+K Control+K"
    >
      <Plus className="size-4" aria-hidden="true" />
      <span className="hidden sm:inline">Quick add</span>
      <kbd className="ml-1 hidden text-[10px] opacity-80 font-mono md:inline-block">⌘K</kbd>
    </button>
  );
}
