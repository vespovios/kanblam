"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type RecurrenceScope = "this" | "following" | "all";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Drives the title + confirm-button label/variant. */
  action: "edit" | "delete";
  /** Called with the chosen scope when the user confirms. */
  onConfirm: (scope: RecurrenceScope) => void;
}

const OPTIONS: { value: RecurrenceScope; label: string }[] = [
  { value: "this", label: "This task" },
  { value: "following", label: "This and following tasks" },
  { value: "all", label: "All tasks" },
];

/**
 * Google-Calendar-style scope prompt shown before an edit or delete on a
 * recurring task instance — "This task / This and following / All tasks".
 * Defaults to the safe "This task" each time it opens.
 */
export function RecurringScopeDialog({
  open,
  onOpenChange,
  action,
  onConfirm,
}: Props) {
  const [scope, setScope] = useState<RecurrenceScope>("this");

  // Reset to the least-destructive default whenever the dialog opens.
  useEffect(() => {
    if (open) setScope("this");
  }, [open]);

  const title =
    action === "delete" ? "Delete repeating task" : "Edit repeating task";
  const confirmLabel = action === "delete" ? "Delete" : "Save";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2.5 py-1">
          {OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2.5 text-sm cursor-pointer"
            >
              <input
                type="radio"
                name="recurrence-scope"
                checked={scope === opt.value}
                onChange={() => setScope(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={action === "delete" ? "destructive" : "default"}
            onClick={() => {
              onConfirm(scope);
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
