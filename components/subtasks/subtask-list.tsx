"use client";

import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { Input } from "@/components/ui/input";
import { SUBTASKS_PER_TASK_MAX } from "@/lib/validators/subtask";
import { SubtaskRow, type SubtaskRowItem } from "./subtask-row";

interface Props {
  taskId: string;
  /** Server-source-of-truth subtasks. */
  subtasks: SubtaskRowItem[];
  /** Called immediately on optimistic local change AND after server confirmation/revert.
   *  Used by parents to update their own view of the list. Do NOT use this to refetch
   *  parent-task state that depends on the server having finished its recompute —
   *  this fires before the PATCH has been sent. Use `onMutationApplied` for that. */
  onChanged: (next: SubtaskRowItem[]) => void;
  /** Called only AFTER a successful server mutation that may have changed the parent
   *  task's progressPct (add / toggle-completed / delete). Parents observing
   *  Task.progressPct should refetch here, not in onChanged. Not fired for rename
   *  or reorder (no progress impact). */
  onMutationApplied?: () => void;
}

export function SubtaskList({ taskId, subtasks, onChanged, onMutationApplied }: Props) {
  const [draft, setDraft] = useState("");
  // Pointer + Keyboard. Vertical sortable list so the keyboard sensor
  // moves Up/Down between adjacent items naturally.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const atCap = subtasks.length >= SUBTASKS_PER_TASK_MAX;

  async function handleAdd() {
    if (atCap) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    const res = await fetch(`/api/tasks/${taskId}/subtasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
    if (!res.ok) return;
    const { subtask } = await res.json();
    onChanged([...subtasks, { id: subtask.id, title: subtask.title, completed: subtask.completed }]);
    setDraft("");
    onMutationApplied?.();
  }

  async function handleToggle(id: string, completed: boolean) {
    const optimistic = subtasks.map((s) => (s.id === id ? { ...s, completed } : s));
    onChanged(optimistic);
    const res = await fetch(`/api/subtasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    });
    if (!res.ok) {
      onChanged(subtasks); // revert on failure
      return;
    }
    onMutationApplied?.();
  }

  async function handleRename(id: string, title: string) {
    const optimistic = subtasks.map((s) => (s.id === id ? { ...s, title } : s));
    onChanged(optimistic);
    const res = await fetch(`/api/subtasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) onChanged(subtasks);
    // Rename does not affect progress; no onMutationApplied call.
  }

  async function handleDelete(id: string) {
    const optimistic = subtasks.filter((s) => s.id !== id);
    onChanged(optimistic);
    const res = await fetch(`/api/subtasks/${id}`, { method: "DELETE" });
    if (!res.ok) {
      onChanged(subtasks);
      return;
    }
    onMutationApplied?.();
  }

  async function handleDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIndex = subtasks.findIndex((s) => s.id === e.active.id);
    const newIndex = subtasks.findIndex((s) => s.id === e.over!.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(subtasks, oldIndex, newIndex);
    onChanged(reordered);
    const res = await fetch(`/api/tasks/${taskId}/subtasks/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: reordered.map((s) => s.id) }),
    });
    if (!res.ok) onChanged(subtasks);
    // Reorder does not affect progress; no onMutationApplied call.
  }

  const completed = subtasks.filter((s) => s.completed).length;

  return (
    <div className="space-y-1">
      {subtasks.length > 0 && (
        <p className="text-xs text-muted-foreground">{completed}/{subtasks.length} complete</p>
      )}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-0.5">
            {subtasks.map((s) => (
              <SubtaskRow
                key={s.id}
                item={s}
                onToggle={(c) => handleToggle(s.id, c)}
                onTitleChange={(t) => handleRename(s.id, t)}
                onDelete={() => handleDelete(s.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div className="flex items-center gap-2 pt-1">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            } else if (e.key === "Escape") {
              setDraft("");
            }
          }}
          disabled={atCap}
          placeholder={
            atCap
              ? `Maximum ${SUBTASKS_PER_TASK_MAX} subtasks reached`
              : subtasks.length === 0
                ? "Add a subtask"
                : "+ Add subtask"
          }
          className="h-7 text-sm"
        />
      </div>
    </div>
  );
}
