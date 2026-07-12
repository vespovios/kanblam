"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** `?` opens a cheat-sheet of the app's keyboard shortcuts (deferred since
 *  0.8.2). Self-contained: registers its own hotkey with the same guards as
 *  the Quick Add ⌘K listener — ignored while typing in an input/textarea/
 *  contenteditable and while any other dialog is open. */

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground whitespace-nowrap">
      {children}
    </kbd>
  );
}

function Row({ keys, children }: { keys: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-sm text-muted-foreground">{children}</span>
      <span className="flex items-center gap-1 shrink-0">{keys}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-4 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground first:mt-0">
      {children}
    </h3>
  );
}

export function ShortcutHelpDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // "?" is Shift+/ on most layouts — e.key resolves the shifted char, so
      // only bail on the chord modifiers.
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable]")) return;

      // Same base-ui data-open convention as the Quick Add hotkey — also
      // covers this dialog itself, so "?" can't re-trigger while open.
      if (document.querySelector('[role="dialog"][data-open]')) return;

      e.preventDefault();
      setOpen(true);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>

        <div>
          <SectionTitle>Global</SectionTitle>
          <Row keys={<><Key>⌘K</Key> <Key>Ctrl+K</Key></>}>Open Quick Add</Row>
          <Row keys={<Key>?</Key>}>This cheat sheet</Row>
          <Row keys={<Key>Esc</Key>}>Close the current dialog or drawer</Row>

          <SectionTitle>Quick Add tokens</SectionTitle>
          <Row keys={<Key>[CODE]</Key>}>Set the project by code</Row>
          <Row keys={<Key>#tag</Key>}>Add a tag (creates it if new)</Row>
          <Row keys={<Key>@person</Key>}>Assign to a member</Row>
          <Row keys={<><Key>!high</Key> <Key>!med</Key> <Key>!low</Key></>}>Set priority</Row>
          <Row keys={<><Key>!important</Key> <Key>!urgent</Key></>}>Eisenhower flags</Row>
          <Row keys={<Key>due:fri</Key>}>Set due date — also due:tomorrow, due:2026-06-15</Row>

          <SectionTitle>Drag and drop, no mouse</SectionTitle>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <Key>Tab</Key> to a card&apos;s drag handle, <Key>Space</Key> picks
            it up, <Key>←↑↓→</Key> move it, <Key>Space</Key> drops,{" "}
            <Key>Esc</Key> cancels. Works on Kanban, Eisenhower, Calendar and
            subtasks.
          </p>

          <p className="mt-4 text-xs text-muted-foreground">
            Full reference:{" "}
            <a
              href="/docs/keyboard"
              target="_blank"
              rel="noopener"
              className="underline hover:text-foreground"
            >
              docs → keyboard shortcuts
            </a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
