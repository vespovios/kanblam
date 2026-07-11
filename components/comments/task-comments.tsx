"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

/** Comments panel inside the task drawer. Self-contained: lazy-loads on
 *  mount, posts/deletes through the internal session routes, and needs no
 *  user prop — `canDelete` comes computed from the server. Buttons are all
 *  type="button" (the panel lives inside the drawer's <form>). */

interface CommentItem {
  id: string;
  body: string;
  author: { id: string; name: string | null; kind: "HUMAN" | "AGENT" } | null;
  createdAt: string;
  canDelete: boolean;
}

interface Props {
  taskId: string;
  readOnly?: boolean;
}

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function TaskComments({ taskId, readOnly = false }: Props) {
  const [comments, setComments] = useState<CommentItem[] | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const listEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}/comments`);
    if (res.ok) setComments((await res.json()).comments);
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post() {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    const res = await fetch(`/api/tasks/${taskId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setPosting(false);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast.error(err?.error ?? "Failed to post comment");
      return;
    }
    setDraft("");
    await load();
    listEndRef.current?.scrollIntoView({ block: "nearest" });
  }

  async function remove(id: string) {
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete comment");
      return;
    }
    setComments((prev) => prev?.filter((c) => c.id !== id) ?? null);
  }

  return (
    <div className="space-y-2">
      {comments === null ? (
        <p className="text-xs text-muted-foreground">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md border bg-background px-2.5 py-2 text-sm">
              <div className="mb-0.5 flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold">
                  {c.author?.name ?? (c.author ? "Unnamed" : "Former member")}
                  {c.author?.kind === "AGENT" && (
                    <Badge variant="outline" className="ml-1.5">Agent</Badge>
                  )}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {fmtWhen(c.createdAt)}
                  {c.canDelete && !readOnly && (
                    <button
                      type="button"
                      onClick={() => remove(c.id)}
                      className="ml-2 text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                    >
                      delete
                    </button>
                  )}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words">{c.body}</p>
            </li>
          ))}
          <div ref={listEndRef} />
        </ul>
      )}

      {!readOnly && (
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a comment…"
            rows={2}
            maxLength={10_000}
            className="min-h-9 flex-1 text-sm"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void post();
              }
            }}
          />
          <Button type="button" size="sm" onClick={post} disabled={posting || !draft.trim()}>
            {posting ? "…" : "Post"}
          </Button>
        </div>
      )}
    </div>
  );
}
