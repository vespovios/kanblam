"use client";

import { useEffect } from "react";

/**
 * Listens for ⌘K / Ctrl+K and calls onToggle() unless:
 *   • focus is inside an input/textarea/contenteditable element
 *   • another @base-ui/react Dialog is already open
 */
export function useQuickAddHotkey(onToggle: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.key === "k" && (e.metaKey || e.ctrlKey))) return;

      const target = e.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable]")) return;

      // Suppress when another dialog is already open. base-ui Dialog popups
      // carry [role="dialog"][data-open] when shown (NOT data-state="open" —
      // that's a Radix convention; base-ui uses bare data-open / data-closed,
      // confirmed in @base-ui/react/dialog/popup/DialogPopupDataAttributes).
      if (document.querySelector('[role="dialog"][data-open]')) return;

      e.preventDefault();
      onToggle();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onToggle]);
}
