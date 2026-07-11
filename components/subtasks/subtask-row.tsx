"use client";

import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SubtaskRowItem {
  id: string;
  title: string;
  completed: boolean;
}

interface Props {
  item: SubtaskRowItem;
  /** When false, the checkbox column is hidden (template-list mode). */
  showCheckbox?: boolean;
  onToggle?: (completed: boolean) => void;
  onTitleChange: (title: string) => void;
  onDelete: () => void;
}

export function SubtaskRow({
  item,
  showCheckbox = true,
  onToggle,
  onTitleChange,
  onDelete,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.select();
  }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== item.title) onTitleChange(trimmed);
    else setDraft(item.title);
    setEditing(false);
  }

  function cancel() {
    setDraft(item.title);
    setEditing(false);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/50",
        isDragging && "shadow",
      )}
    >
      <button
        type="button"
        {...listeners}
        {...attributes}
        aria-label="Drag to reorder"
        className="opacity-30 hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        <GripVertical className="size-3.5 text-muted-foreground" />
      </button>
      {showCheckbox && (
        <Checkbox
          checked={item.completed}
          onCheckedChange={(v) => onToggle?.(!!v)}
          aria-label={item.completed ? `Mark "${item.title}" incomplete` : `Mark "${item.title}" complete`}
        />
      )}
      {editing ? (
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          className="h-7 flex-1 text-sm"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={cn(
            "flex-1 text-left text-sm py-0.5 truncate min-w-0",
            item.completed && "line-through text-muted-foreground",
          )}
        >
          {item.title}
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete subtask"
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-1 rounded"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
