"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useReadOnly, READ_ONLY_CONTROL_TITLE } from "@/components/billing/read-only-provider";
import { parseQuickAdd } from "@/lib/quick-add/parse";
import { resolveQuickAdd, type ResolveContext } from "@/lib/quick-add/resolve";
import { formatPreview } from "@/lib/quick-add/preview";
import type {
  QuickAddProjectLite,
  QuickAddTagLite,
  QuickAddMemberLite,
  QuickAddPriorityLite,
} from "./quick-add-provider";

const STORAGE_KEY = "kanblam:quickadd:lastProjectId";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projects: QuickAddProjectLite[];
  tags: QuickAddTagLite[];
  members: QuickAddMemberLite[];
  priorities: QuickAddPriorityLite[];
  defaultPriorityId: string;
  defaultKanbanStageId: string;
  currentUserId: string;
  onTagCreated: (t: QuickAddTagLite) => void;
}

export function QuickAddPalette({
  open,
  onOpenChange,
  projects,
  tags,
  members,
  priorities,
  defaultPriorityId,
  defaultKanbanStageId,
  currentUserId,
  onTagCreated,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const readOnly = useReadOnly();
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset input when palette closes.
  useEffect(() => {
    if (!open) setInput("");
  }, [open]);

  const defaultProjectId = useMemo<string | null>(() => {
    if (typeof window === "undefined") return projects[0]?.id ?? null;

    // Priority 1: current project page.
    const m = pathname?.match(/^\/projects\/([^/]+)/);
    if (m && projects.find((p) => p.id === m[1])) return m[1];

    // Priority 2: localStorage last-used (if still valid).
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && projects.find((p) => p.id === stored)) return stored;

    // Priority 3: first project alphabetically.
    return projects[0]?.id ?? null;
    // `open` is in the dep list intentionally: localStorage isn't React-observable,
    // so we use the open transition as the cue to re-read it. Don't drop it.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `open` triggers re-evaluation, not consumed inside the body
  }, [pathname, projects, open]);

  const parsed = useMemo(() => parseQuickAdd(input), [input]);

  // Errors are only meaningful once the user has typed something — surfacing
  // "Task needs a name" the instant the palette opens (with empty input) is
  // noise. Treat the field as pristine while input is empty (qa#7).
  const hasInput = input.trim().length > 0;

  const previewLine = useMemo(() => {
    if (!hasInput) return "";
    if (parsed.errors.length > 0) return parsed.errors.join(" · ");
    const defaultProjectCode = projects.find((p) => p.id === defaultProjectId)?.code ?? null;
    return formatPreview(parsed, { defaultProjectCode, now: new Date() });
  }, [parsed, projects, defaultProjectId, hasInput]);

  const headerProjectCode = useMemo(() => {
    if (parsed.projectCode) return parsed.projectCode;
    return projects.find((p) => p.id === defaultProjectId)?.code ?? null;
  }, [parsed.projectCode, projects, defaultProjectId]);

  async function handleSubmit() {
    if (submitting) return;

    // Defense in depth: the provider already blocks opening Quick Add in a
    // read-only workspace, but never let a stray submit through — the server
    // would reject it with a 402 anyway.
    if (readOnly) {
      toast.error(READ_ONLY_CONTROL_TITLE);
      return;
    }

    if (parsed.errors.length > 0) {
      toast.error(parsed.errors.join("\n"));
      return;
    }

    const ctx: ResolveContext = {
      projects,
      tags,
      members,
      priorities,
      defaultProjectId,
      defaultPriorityId,
      defaultKanbanStageId,
      currentUserId,
      now: new Date(),
    };
    const resolved = resolveQuickAdd(parsed, ctx);
    if (!resolved.ok) {
      toast.error(resolved.errors.join("\n"));
      return;
    }

    setSubmitting(true);
    try {
      const tagIds = [...(resolved.payload.tagIds ?? [])];

      // 1. Auto-create unknown tags sequentially.
      for (const name of resolved.autoCreateTagNames) {
        const res = await fetch("/api/tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error ?? `Failed to create tag #${name}`);
          return;
        }
        const { tag } = await res.json();
        onTagCreated({ id: tag.id, name: tag.name, color: tag.color });
        tagIds.push(tag.id);
      }

      // 2. Create the task.
      const taskRes = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...resolved.payload, tagIds }),
      });
      if (!taskRes.ok) {
        const data = await taskRes.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to create task");
        return;
      }

      // 3. Persist last-used project id, refresh server components, close.
      const code = projects.find((p) => p.id === resolved.payload.projectId)?.code ?? "?";
      const truncated =
        resolved.payload.name.length > 60
          ? resolved.payload.name.slice(0, 57) + "…"
          : resolved.payload.name;
      toast.success(`Created in [${code}]: ${truncated}`);

      try {
        window.localStorage.setItem(STORAGE_KEY, resolved.payload.projectId);
      } catch {
        // localStorage may be blocked (private mode etc.); non-fatal.
      }

      onOpenChange(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent className="max-w-xl p-0 gap-0 top-[25vh] translate-y-0">
        <div className="flex items-center gap-2 px-4 pt-3 pb-1 text-[11px] text-muted-foreground">
          <kbd className="border border-border rounded px-1 py-0.5 text-[10px]">⌘K</kbd>
          {headerProjectCode && <span>▸ {headerProjectCode}</span>}
        </div>
        <div className="px-4 py-2 border-y border-border">
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={submitting || readOnly}
            placeholder="Type a task…"
            title={readOnly ? READ_ONLY_CONTROL_TITLE : undefined}
            className="w-full bg-transparent outline-none text-base disabled:opacity-60"
          />
        </div>
        <div className="px-4 py-2 text-xs min-h-[2rem]">
          {submitting ? (
            <span className="text-muted-foreground">Creating…</span>
          ) : hasInput && parsed.errors.length > 0 ? (
            <span className="text-destructive">{previewLine}</span>
          ) : hasInput ? (
            <span className="text-muted-foreground">{previewLine}</span>
          ) : (
            // Empty input → show the example-syntax hint here instead of
            // cramming it into the placeholder (which got truncated on
            // the right at the dialog's narrower viewport). The hint
            // promotes itself to the parsed preview as soon as the user
            // starts typing.
            <span className="text-muted-foreground">
              e.g. <span className="font-mono">Fix login [WEB] #auth due:fri @peter !high !urgent</span>
            </span>
          )}
        </div>
        <div className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
          Enter to create · Esc to cancel
        </div>
      </DialogContent>
    </Dialog>
  );
}
