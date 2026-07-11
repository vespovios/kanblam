"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";

/**
 * PostHog analytics provider, scoped to public routes only.
 *
 * Design choices:
 *
 * 1. **Public-only scope.** Analytics initializes and captures events
 *    *only* on the marketing landing (`/`), docs (`/docs/*`), login
 *    (`/login`) and signup (`/signup`). The authenticated app
 *    (everything inside `(app)/`) is deliberately untracked — beta
 *    users haven't consented to session recording, and aggregate
 *    behavior data on a handful of known people is more creepy than
 *    useful. The "AUTH boundary = analytics boundary" rule keeps
 *    privacy posture clean.
 *
 * 2. **Server-injected keys, no `NEXT_PUBLIC_` prefix.** The root
 *    layout reads `POSTHOG_KEY` + `POSTHOG_HOST` at render time and
 *    passes them down as props. Avoids Docker build-arg gymnastics
 *    (NEXT_PUBLIC_ vars must exist at build time, which means passing
 *    them through the Dockerfile and tying the production image to a
 *    specific PostHog project). Rotation = container restart, not
 *    rebuild.
 *
 * 3. **No-op when keys are absent.** Self-host deploys leave the env
 *    vars blank, the provider returns children unchanged, no script
 *    is loaded, no event is captured. PostHog opt-out is the default
 *    posture for self-hosters.
 *
 * 4. **Manual pageview capture.** PostHog's `capture_pageview: true`
 *    would fire on every route change including auth-route
 *    navigations. We disable autocapture and fire `$pageview`
 *    ourselves only when the new pathname matches a public pattern.
 */

interface Props {
  apiKey?: string;
  apiHost?: string;
  children: React.ReactNode;
}

const PUBLIC_PATTERNS: readonly RegExp[] = [
  /^\/$/,
  /^\/login$/,
  /^\/signup(\?.*)?$/,
  /^\/docs(\/.*)?$/,
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATTERNS.some((re) => re.test(pathname));
}

/** Inner pageview-capture component — separated so it can be wrapped in
 *  Suspense (useSearchParams() requires it in Next 15). */
function PageViewCapture() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!posthog.__loaded) return;
    if (!isPublicPath(pathname)) return;
    const qs = searchParams?.toString();
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}${pathname}${qs ? `?${qs}` : ""}`
        : pathname;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ apiKey, apiHost, children }: Props) {
  const pathname = usePathname();

  // Initialise PostHog the first time we hit a public route. If the user
  // navigates straight into an auth route, init never happens — clean.
  useEffect(() => {
    if (!apiKey || !apiHost) return;
    if (!isPublicPath(pathname)) return;
    if (posthog.__loaded) return;
    posthog.init(apiKey, {
      api_host: apiHost,
      person_profiles: "identified_only",
      capture_pageview: false, // we fire manually, scoped to public routes
      capture_pageleave: true,
      // Cookieless: keep the privacy posture clean. We lose returning-visitor
      // dedup but for a marketing landing that's an acceptable trade.
      persistence: "memory",
      // Session replay off by default. PostHog Cloud projects enable
      // replay automatically; we explicitly disable it here because we
      // don't have a privacy policy that mentions behavioural recording
      // yet, and GDPR treats replay as personal data regardless of
      // cookies. Revisit once /docs/privacy ships and we have explicit
      // notice on the landing page. Aggregate events (pageviews,
      // waitlist_signup) keep flowing — only the replay stream is cut.
      disable_session_recording: true,
    });
  }, [pathname, apiKey, apiHost]);

  // When the user leaves a public route into the authenticated app,
  // stop session recording so we never collect auth-side data even if
  // a future refactor accidentally extends the public regex.
  useEffect(() => {
    if (!posthog.__loaded) return;
    if (isPublicPath(pathname)) return;
    posthog.stopSessionRecording();
  }, [pathname]);

  return (
    <>
      {apiKey && apiHost && (
        <Suspense fallback={null}>
          <PageViewCapture />
        </Suspense>
      )}
      {children}
    </>
  );
}
