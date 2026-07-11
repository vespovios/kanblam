"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TagPill } from "./tag-pill";
import { PALETTE } from "@/lib/tags/color";

export interface TagListItem {
  id: string;
  name: string;
  color: string;
  _count: { tasks: number };
}

interface Props {
  initial: TagListItem[];
}

const NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function TagsList({ initial }: Props) {
  const router = useRouter();
  const [tags, setTags] = useState<TagListItem[]>(initial);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [colorEditId, setColorEditId] = useState<string | null>(null);

  async function addTag() {
    const name = newName.trim();
    if (!name) return;
    if (!NAME_PATTERN.test(name)) {
      toast.error("Tag names can only contain letters, numbers, - and _ (no spaces)");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to add tag");
      return;
    }
    const { tag } = await res.json();
    setTags([...tags, { ...tag, _count: { tasks: 0 } }].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName("");
    toast.success(`Tag "${tag.name}" created`);
  }

  async function commitRename(id: string) {
    const current = tags.find((t) => t.id === id);
    if (!current || editName === current.name) {
      setEditingId(null);
      return;
    }
    const name = editName.trim();
    if (!name || !NAME_PATTERN.test(name)) {
      toast.error("Tag names can only contain letters, numbers, - and _ (no spaces)");
      return;
    }
    const res = await fetch(`/api/tags/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to rename");
      return;
    }
    const { tag } = await res.json();
    setTags(tags.map((t) => (t.id === id ? { ...t, name: tag.name } : t)).sort((a, b) => a.name.localeCompare(b.name)));
    setEditingId(null);
  }

  async function changeColor(id: string, color: string) {
    if (!HEX_PATTERN.test(color)) {
      toast.error("Color must be a 6-char hex like #aabbcc");
      return;
    }
    const res = await fetch(`/api/tags/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    });
    if (!res.ok) {
      toast.error("Failed to recolor");
      return;
    }
    const { tag } = await res.json();
    setTags(tags.map((t) => (t.id === id ? { ...t, color: tag.color } : t)));
    setColorEditId(null);
    router.refresh();
  }

  async function removeTag(id: string) {
    const t = tags.find((x) => x.id === id);
    if (!t) return;
    if (!confirm(`This tag is on ${t._count.tasks} task${t._count.tasks === 1 ? "" : "s"} — confirm delete?`)) return;
    const res = await fetch(`/api/tags/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete");
      return;
    }
    setTags(tags.filter((t) => t.id !== id));
    toast.success("Tag deleted");
    router.refresh();
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex gap-2">
        <Input
          placeholder="New tag name (no spaces — use - or _)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addTag(); }}
        />
        <Button onClick={addTag} disabled={busy || !newName.trim()}>
          {busy ? "Adding…" : "Add tag"}
        </Button>
      </div>

      {tags.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">No tags yet. Add one above, or apply tags directly from a task.</p>
        </div>
      ) : (
        <ul className="rounded-lg border divide-y bg-card">
          {tags.map((t) => (
            <li key={t.id} className="flex items-center gap-3 p-3">
              <button
                type="button"
                onClick={() => setColorEditId(colorEditId === t.id ? null : t.id)}
                className="relative h-6 w-6 rounded-full border shrink-0"
                style={{ background: t.color }}
                aria-label={`Color: ${t.color}`}
              />
              {colorEditId === t.id && (
                <div className="absolute z-50 mt-1 rounded-md border bg-popover p-2 shadow-md grid grid-cols-6 gap-1">
                  {PALETTE.map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => changeColor(t.id, c)}
                      className="h-6 w-6 rounded-full border"
                      style={{ background: c }}
                      aria-label={c}
                    />
                  ))}
                  <input
                    type="text"
                    placeholder="#hex"
                    className="col-span-6 mt-1 h-7 rounded border px-2 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") changeColor(t.id, (e.target as HTMLInputElement).value);
                    }}
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                {editingId === t.id ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => commitRename(t.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(t.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="w-full rounded border px-2 py-1 text-sm"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(t.id);
                      setEditName(t.name);
                    }}
                    className="text-left"
                  >
                    <TagPill tag={t} />
                  </button>
                )}
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {t._count.tasks} task{t._count.tasks === 1 ? "" : "s"}
              </span>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeTag(t.id)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
