import type { NextConfig } from "next";
import nextra from "nextra";

/** Nextra v4 wrapping. Enables MDX support across the app (so .mdx files
 *  in /app/docs/... render as pages) and provides Nextra's page-tree
 *  collection for the eventual sidebar/nav. Docs content + theme wiring
 *  comes in a later session; right now this just gets the framework in
 *  so /docs serves something instead of 404. */
const withNextra = nextra({
  // Search via Pagefind happens on `next build`; safe default.
  search: { codeblocks: false },
  // The codebase already uses next/image; let Nextra cooperate with it.
  defaultShowCopyCode: true,
  // Markdown images in /docs stay plain <img> tags (styled via the img
  // override in mdx-components.tsx). With staticImage on (the default),
  // Nextra rewrites ![...](/images/...) into static imports rendered
  // through nextra's client-side image component — which pulls
  // createContext into the server component graph under Turbopack and
  // 500s every docs page that contains an image ("createContext only
  // works in Client Components"). Our screenshots are local static
  // assets; we don't need blur placeholders.
  staticImage: false,
});

/** Security headers applied to every response — defense-in-depth for the
 *  public surface. The big rocks:
 *  - HSTS pins the browser to HTTPS for two years.
 *  - X-Frame-Options + frame-ancestors blocks clickjacking via <iframe>.
 *  - X-Content-Type-Options stops MIME-sniff confusion attacks.
 *  - Referrer-Policy keeps full URLs (which can contain tokens) out of
 *    cross-origin Referer headers.
 *  - Permissions-Policy disables sensors we never use.
 *  - CSP is the broadest: only allow same-origin resources, with the
 *    `'unsafe-inline'` carve-outs that Next 15 App Router currently
 *    requires for its hydration markers and emotion-style CSS-in-JS.
 *    A nonce-based hardening is the next step once we ship middleware
 *    (Phase 1) — won't bother before then. */
const SECURITY_HEADERS = [
  // 63072000s = 2 years. `preload` is intentional — once we're on the
  // HSTS preload list, every browser hard-codes HTTPS for kanblam.com
  // even on first visit. (Submission is a separate manual step at
  // https://hstspreload.org once you're ready.)
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next emits inline hydration markers; 'unsafe-inline' is the
      // documented App Router default until you adopt nonces.
      // eu-assets.i.posthog.com hosts the PostHog beacon script
      // (loaded only on public routes via posthog-provider.tsx).
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://eu-assets.i.posthog.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      // next/font self-hosts Geist Sans + Mono under /_next/static/media,
      // so 'self' is enough; data: covers any inline data-URI fonts.
      "font-src 'self' data:",
      // Same-origin for fetch + SSE (no third-party APIs called from the
      // browser today). eu.i.posthog.com receives PostHog events.
      // When billing ships, add Polar's host here.
      "connect-src 'self' https://eu.i.posthog.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
] as const;

const nextConfig: NextConfig = {
  output: "standalone",
  // REQUIRED for `next dev` (Turbopack) + Nextra: point the MDX import
  // source at our mdx-components.tsx explicitly. Nextra's default turbopack
  // alias (@vercel/turbopack-next/mdx-import-source) does not resolve with
  // Nextra's page-file convention — every route that touches MDX fails with
  // "Module not found: Can't resolve 'next-mdx-import-source-file'".
  // Documented fix: https://nextra.site/docs/guide/turbopack
  // (Production `next build` uses webpack, where Nextra wires the alias
  // itself — which is why the VPS never hit this.)
  turbopack: {
    resolveAlias: {
      "next-mdx-import-source-file": "./mdx-components.tsx",
    },
  },
  // NOTE (dev-environment hazard, learned 2026-07-05): Next walks UP from
  // the repo looking for lockfiles to infer the workspace root. A stray
  // package-lock.json + node_modules in a PARENT folder (leftover tooling
  // in the OneDrive share above this repo) made Next adopt the parent as
  // root, which broke Nextra's next-mdx-import-source-file alias —
  // mdx-components.tsx silently fell back to the client-only @mdx-js/react
  // provider and every /docs page 500'd with "createContext only works in
  // Client Components". If that error ever reappears, check for lockfiles
  // above the repo (`ls ../package-lock.json ../../package-lock.json`)
  // before debugging the code. (Don't pin `turbopack.root` here — __dirname
  // in the transpiled config doesn't resolve to the repo dir and breaks
  // the import map entirely.)
  async headers() {
    return [
      {
        // Apply to every route — including /api/* and static assets. The
        // CSP on static assets is harmless; the rest are defense-in-depth.
        source: "/:path*",
        headers: SECURITY_HEADERS.map((h) => ({ ...h })),
      },
    ];
  },
};

export default withNextra(nextConfig);
