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
import { SubtaskRow } from "./subtask-row";

/** Item shape used inside the recurring form's local state.
 *  Server-known items have a real id; new items use a synthetic local id
 *  (e.g. "tmp-<n>") so DnD has a stable key. The sender strips synthetic ids
 *  before posting. */
export interface SubtaskTemplateItem {
  id: string;
  serverId?: string; // real id if persisted; absent for newly-added rows
  title: string;
}

interface Props {
  items: SubtaskTemplateItem[];
  onChange: (next: SubtaskTemplateItem[]) => void;
}

export function SubtaskTemplateList({ items, onChange }: Props) {
  const [draft, setDraft] = useState("");
  // Pointer + Keyboard. Vertical sortable list — Up/Down arrows move
  // between adjacent items naturally.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const atCap = items.length >= SUBTASKS_PER_TASK_MAX;

  function handleAdd() {
    if (atCap) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    const id = `tmp-${crypto.randomUUID()}`;
    onChange([...items, { id, title: trimmed }]);
    setDraft("");
  }

  function handleRename(id: string, title: string) {
    onChange(items.map((i) => (i.id === id ? { ...i, title } : i)));
  }

  function handleDelete(id: string) {
    onChange(items.filter((i) => i.id !== id));
  }

  function handleDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIndex = items.findIndex((i) => i.id === e.active.id);
    const newIndex = items.findIndex((i) => i.id === e.over!.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(items, oldIndex, newIndex));
  }

  return (
    <div className="space-y-1">
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-0.5">
            {items.map((i) => (
              <SubtaskRow
                key={i.id}
                item={{ id: i.id, title: i.title, completed: false }}
                showCheckbox={false}
                onTitleChange={(t) => handleRename(i.id, t)}
                onDelete={() => handleDelete(i.id)}
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
              : items.length === 0
                ? "Add a subtask template"
                : "+ Add subtask template"
          }
          className="h-7 text-sm"
        />
      </div>
    </div>
  );
}
