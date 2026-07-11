/**
 * MDX components provider — Next.js looks for this file at the project root
 * (resolved via the `next-mdx-import-source-file` webpack alias that
 * Nextra's withNextra() wraps in).
 *
 * Nextra v4 emits compiled pages that do `components.wrapper(...)` to wrap
 * the rendered MDX body. If `wrapper` isn't present in our returned object,
 * the page crashes at prerender with `Cannot read properties of undefined
 * (reading 'wrapper')`. So we provide a minimal pass-through wrapper that
 * just renders its children. Our parent layout (`app/docs/layout.tsx`)
 * handles the actual page chrome and prose styling.
 *
 * When the docs site grows into a full Nextra theme (sidebar, search,
 * dark mode), swap this for the full `nextra-theme-docs` hook AND switch
 * `app/docs/layout.tsx` to use that theme's <Layout> at the same time.
 * See commit history for the pattern.
 */

import type { MDXComponents } from "mdx/types";

export function useMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    wrapper: ({ children }) => <>{children}</>,
    /** Docs screenshots: plain markdown images get consistent app-window
     *  framing so every screenshot in /docs looks the same without
     *  per-page markup. Plain <img> (not next/image) — MDX markdown
     *  images carry no width/height and these are local static assets. */
    img: (props) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        {...props}
        alt={props.alt ?? ""}
        loading="lazy"
        className="rounded-xl border border-border shadow-md my-6"
      />
    ),
    ...components,
  };
}
