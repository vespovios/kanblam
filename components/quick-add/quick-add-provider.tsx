"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { QuickAddPalette } from "./quick-add-palette";
import { useQuickAddHotkey } from "./use-quick-add-hotkey";
import { pickDefaultPriorityId } from "@/lib/tasks/defaults";
import { useReadOnly } from "@/components/billing/read-only-provider";

type QuickAddCtx = { open: () => void; close: () => void };

const Ctx = createContext<QuickAddCtx | null>(null);

export type QuickAddProjectLite = { id: string; code: string };
export type QuickAddTagLite = { id: string; name: string; color: string };
export type QuickAddMemberLite = { id: string; name: string | null; email: string };
export type QuickAddPriorityLite = { id: string; name: string };
export type QuickAddStageLite = { id: string; name: string; order: number };

export interface QuickAddProviderProps {
  projects: QuickAddProjectLite[];
  tags: QuickAddTagLite[];
  members: QuickAddMemberLite[];
  priorities: QuickAddPriorityLite[];
  kanbanStages: QuickAddStageLite[];
  currentUserId: string;
  children: React.ReactNode;
}

export function QuickAddProvider({
  projects,
  tags: initialTags,
  members,
  priorities,
  kanbanStages,
  currentUserId,
  children,
}: QuickAddProviderProps) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState(initialTags);
  const readOnly = useReadOnly();

  // Read-only workspaces can't create tasks (the server rejects the write with
  // a 402), so never let Quick Add open — neither via the context `open` nor the
  // ⌘K hotkey. Closing always works so an already-open palette can be dismissed.
  const openFn = useCallback(() => {
    if (!readOnly) setOpen(true);
  }, [readOnly]);
  const closeFn = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => {
    if (!readOnly) setOpen((o) => !o);
    else setOpen(false);
  }, [readOnly]);

  useQuickAddHotkey(toggle);

  const value = useMemo<QuickAddCtx>(() => ({ open: openFn, close: closeFn }), [openFn, closeFn]);

  const defaultPriorityId = pickDefaultPriorityId(priorities);
  const sortedStages = [...kanbanStages].sort((a, b) => a.order - b.order);
  const defaultKanbanStageId = sortedStages[0]?.id ?? "";

  return (
    <Ctx.Provider value={value}>
      {children}
      <QuickAddPalette
        open={open}
        onOpenChange={setOpen}
        projects={projects}
        tags={tags}
        members={members}
        priorities={priorities}
        defaultPriorityId={defaultPriorityId}
        defaultKanbanStageId={defaultKanbanStageId}
        currentUserId={currentUserId}
        onTagCreated={(t) => setTags((prev) => [...prev, t])}
      />
    </Ctx.Provider>
  );
}

export function useQuickAdd(): QuickAddCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useQuickAdd outside QuickAddProvider");
  return ctx;
}
