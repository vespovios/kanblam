"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";

/** Client half of /demo: provisions a throwaway tenant via POST /api/demo,
 *  signs the visitor in with the returned credentials, and lands them on
 *  DayDash — narrating each step Vikunja-demo style. The narration is
 *  honest theatre: lines advance on a timer while the real work (one API
 *  call + one sign-in) runs underneath. */

const SCRIPT_LINES = [
  "Rolling out the launch pad…",
  "Creating your mission-control account…",
  "Recruiting the payload crew…",
  "Filling the balloon — steady on the helium…",
  "Loading the Stratos-1 mission: 4 projects, 30 tasks…",
  "Arming the APRS tracker…",
  "Checking the weather window…",
];

export function DemoLauncher() {
  const started = useRef(false);
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return; // StrictMode double-effect guard
    started.current = true;

    let lineIdx = 0;
    const ticker = setInterval(() => {
      if (lineIdx < SCRIPT_LINES.length) {
        const next = SCRIPT_LINES[lineIdx];
        setLines((prev) => [...prev, next]);
        lineIdx += 1;
      }
    }, 900);

    (async () => {
      try {
        const res = await fetch("/api/demo", { method: "POST" });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(body?.error ?? "Demo provisioning failed.");
        }
        const login = await signIn("credentials", {
          email: body.email,
          password: body.password,
          redirect: false,
        });
        if (login?.error) throw new Error("Automatic sign-in failed — please try again.");
        clearInterval(ticker);
        setLines((prev) => [
          ...prev,
          `Welcome aboard, ${body.displayName}! T-minus 3… 2… 1… 🎈`,
        ]);
        // Brief beat so the last line is readable, then into the app.
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 1200);
      } catch (e) {
        clearInterval(ticker);
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    })();

    return () => clearInterval(ticker);
  }, []);

  if (error) {
    return (
      <div className="text-center">
        <p className="mb-4 text-base text-destructive">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div aria-live="polite" className="space-y-2 text-center">
      {lines.map((line, i) => (
        <p
          key={i}
          className={
            i === lines.length - 1
              ? "text-base text-foreground"
              : "text-base text-muted-foreground"
          }
        >
          {line}
        </p>
      ))}
    </div>
  );
}
