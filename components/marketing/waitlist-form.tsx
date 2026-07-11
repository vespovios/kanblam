"use client";

import { useState } from "react";
import posthog from "posthog-js";

/** Email-capture form for the closed-beta landing. Submits to /api/waitlist;
 *  on success swaps to a thank-you state. The operator gets the email by
 *  notification mail; PostHog captures an aggregate `waitlist_signup` event
 *  with only the email *domain* (not the address) for privacy-respecting
 *  attribution — we know "got a gmail signup from /docs after a 6-minute
 *  visit" without persisting the address client-side. */
export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  if (state === "done") {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-primary bg-card p-5 text-center">
        <div className="mb-1 text-base font-semibold text-primary">You&apos;re on the list 🎉</div>
        <p className="text-sm text-muted-foreground">
          We&apos;ll email you the moment KanBlam opens to the public.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!email) return;
        setState("loading");
        try {
          const res = await fetch("/api/waitlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          if (!res.ok) throw new Error("submit failed");
          // Fire an aggregate analytics event — domain only, never the
          // address itself. PostHog is only initialised on public routes
          // (this form is on the landing), so the no-op fallback is fine
          // for self-host deployments where analytics is disabled.
          if (posthog.__loaded) {
            const emailDomain = email.split("@")[1]?.toLowerCase() ?? "unknown";
            posthog.capture("waitlist_signup", { email_domain: emailDomain });
          }
          setState("done");
        } catch {
          setState("error");
        }
      }}
      className="mx-auto flex max-w-md flex-col gap-2 sm:flex-row"
    >
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        disabled={state === "loading"}
        className="min-w-0 flex-1 rounded-xl border border-border bg-card px-4 py-3 text-base outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={state === "loading"}
        className="rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
      >
        {state === "loading" ? "Joining…" : "Notify me at launch"}
      </button>
      {state === "error" && (
        <p className="sm:absolute sm:translate-y-14 text-sm text-destructive">
          Something went wrong. Try again in a moment?
        </p>
      )}
    </form>
  );
}
