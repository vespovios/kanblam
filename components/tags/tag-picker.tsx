"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { TagPill, type TagLite } from "./tag-pill";

interface Props {
  /** All workspace tags (with usage counts already merged in by the parent). */
  allTags: (TagLite & { _count: { tasks: number } })[];
  /** Current selection (array of tag IDs). */
  selectedIds: string[];
  /** Called when the selection changes. */
  onChange: (ids: string[]) => void;
  /** Called when the user opts to create a new tag inline. Should hit POST /api/tags
   *  and return the created tag (with _count). The picker auto-adds it to the selection. */
  onCreateTag: (name: string) => Promise<(TagLite & { _count: { tasks: number } }) | null>;
}

const NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

export function TagPicker({ allTags, selectedIds, onChange, onCreateTag }: Props) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = selectedIds
    .map((id) => allTags.find((t) => t.id === id))
    .filter((t): t is TagLite & { _count: { tasks: number } } => t !== undefined);

  const trimmed = input.trim();
  const matches = allTags
    .filter((t) => !selectedIds.includes(t.id))
    .filter((t) => trimmed === "" || t.name.toLowerCase().includes(trimmed.toLowerCase()))
    .sort((a, b) => b._count.tasks - a._count.tasks);

  const exactMatch = allTags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
  const showCreateOption = trimmed.length > 0 && !exactMatch && NAME_PATTERN.test(trimmed);

  function add(id: string) {
    if (selectedIds.includes(id)) return;
    onChange([...selectedIds, id]);
    setInput("");
    inputRef.current?.focus();
  }

  function remove(id: string) {
    onChange(selectedIds.filter((x) => x !== id));
  }

  async function handleCreate() {
    if (!showCreateOption || creating) return;
    setCreating(true);
    try {
      const created = await onCreateTag(trimmed);
      if (created) {
        onChange([...selectedIds, created.id]);
        setInput("");
      }
    } finally {
      setCreating(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (matches.length > 0) {
        add(matches[0].id);
      } else if (showCreateOption) {
        void handleCreate();
      }
    } else if (e.key === "Backspace" && input === "" && selectedIds.length > 0) {
      remove(selectedIds[selectedIds.length - 1]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Close dropdown on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onDoc);
      return () => document.removeEventListener("mousedown", onDoc);
    }
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex flex-wrap gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-within:ring-1 focus-within:ring-ring cursor-text"
        onClick={() => {
          inputRef.current?.focus();
          setOpen(true);
        }}
      >
        {selected.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1">
            <TagPill tag={t} />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(t.id);
              }}
              className="text-muted-foreground hover:text-foreground -ml-0.5 text-xs"
              aria-label={`Remove ${t.name}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selected.length === 0 ? "Add tags…" : ""}
          className="flex-1 min-w-[6rem] outline-none bg-transparent text-sm"
        />
      </div>

      {open && (matches.length > 0 || showCreateOption) && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {matches.map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => add(t.id)}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
            >
              <TagPill tag={t} />
              <span className="text-xs text-muted-foreground">{t._count.tasks}</span>
            </button>
          ))}
          {showCreateOption && (
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="block w-full border-t px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
            >
              {creating ? "Creating…" : <>+ Create &ldquo;{trimmed}&rdquo;</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
