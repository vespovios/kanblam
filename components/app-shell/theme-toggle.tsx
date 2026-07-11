"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

/**
 * Icon button that flips between light and dark. System theme is the default
 * on first load — clicking the toggle commits the user to an explicit choice
 * which persists via next-themes' `storageKey="kanblam-theme"`.
 *
 * Renders a static placeholder until mounted to dodge the next-themes
 * hydration mismatch (server renders `defaultTheme`, client renders whatever
 * localStorage says).
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--header-foreground)] opacity-70 hover:opacity-100 hover:bg-[var(--header-hover)] transition-[opacity,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--header-bg)]"
    >
      {mounted ? (
        isDark ? <Sun className="size-4" /> : <Moon className="size-4" />
      ) : (
        // Placeholder keeps the button width stable before mount.
        <span className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}
