"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Thin wrapper around next-themes that pins our chosen storage key + class
 * strategy. Mounted once in the root layout; consumers use `useTheme()`.
 *
 * - `attribute="class"` toggles `.dark` on <html>, which our globals.css
 *   `.dark` block hooks into.
 * - `defaultTheme="system"` lets the OS preference win on first paint until
 *   the user explicitly picks via the toggle.
 * - `disableTransitionOnChange` avoids a brief CSS-transition flash when
 *   swapping themes.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="kanblam-theme"
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
