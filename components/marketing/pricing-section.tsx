"use client";

import { useState } from "react";
import {
  CURRENCIES,
  CURRENCY_COOKIE,
  PLAN,
  formatPrice,
  type BillingCadence,
  type CurrencyCode,
} from "@/lib/marketing/pricing";

/** Client island for the landing page's pricing block.
 *
 *  Three pieces of interactivity over an otherwise static (server) page:
 *    1. Currency switcher — defaults to the server-resolved currency
 *       (from Cloudflare geo), lets the visitor override, and persists the
 *       choice to the `kb_currency` cookie so SSR honours it next time.
 *    2. Monthly / annual cadence toggle — annual is the default (the deal).
 *    3. The price card itself, rendered in the chosen currency + cadence.
 *
 *  Prices are Apple-style: same digits everywhere, only the symbol changes —
 *  so switching currency is a pure client formatting change, no round-trip.
 *  The cookie is written for the *next* server render to stay consistent. */

const PLAN_FEATURES = [
  "Every feature — Kanban, Eisenhower, Calendar, DayDash",
  "Recurring tasks & projects",
  "Your data backed up nightly",
  "Automatic updates",
  "Invite your team to your workspace",
];

interface Props {
  /** Currency resolved server-side (geo header or saved cookie). */
  initialCurrency: CurrencyCode;
  /** When true the CTA points at the waitlist; otherwise it's hidden text. */
  waitlistEnabled?: boolean;
}

function setCurrencyCookie(code: CurrencyCode) {
  // 1-year, root path, lax — readable by the server on the next request.
  document.cookie = `${CURRENCY_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
}

export function PricingSection({ initialCurrency, waitlistEnabled = true }: Props) {
  const [currency, setCurrency] = useState<CurrencyCode>(initialCurrency);
  const [cadence, setCadence] = useState<BillingCadence>("annual");

  const plan = PLAN[cadence];
  const headline = formatPrice(plan.perMonth, currency);

  function onCurrencyChange(code: CurrencyCode) {
    setCurrency(code);
    setCurrencyCookie(code);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mx-auto mb-10 max-w-xl text-center">
        <h2 className="mb-3 text-3xl font-extrabold tracking-tight">One plan. One price.</h2>
        <p className="text-lg text-muted-foreground">
          When we open the doors, here&apos;s what it&apos;ll cost. No tiers, no per-seat maths,
          no &ldquo;contact sales&rdquo;.
        </p>
      </div>

      {/* controls: cadence toggle + currency switcher */}
      <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
        <div
          role="radiogroup"
          aria-label="Billing cadence"
          className="inline-flex rounded-lg border border-border bg-card p-0.5"
        >
          <button
            type="button"
            role="radio"
            aria-checked={cadence === "annual"}
            onClick={() => setCadence("annual")}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
              cadence === "annual"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Annual
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={cadence === "monthly"}
            onClick={() => setCadence("monthly")}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
              cadence === "monthly"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Monthly
          </button>
        </div>

        <label className="sr-only" htmlFor="currency-select">
          Currency
        </label>
        <select
          id="currency-select"
          aria-label="Currency"
          value={currency}
          onChange={(e) => onCurrencyChange(e.target.value as CurrencyCode)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {Object.values(CURRENCIES).map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* price card */}
      <div className="mx-auto max-w-sm rounded-3xl border-2 border-primary bg-card p-8 text-center">
        <div className="text-sm font-bold uppercase tracking-wide text-primary">
          Hosted · at launch
        </div>
        <div className="mt-2.5 flex items-baseline justify-center gap-1 text-5xl font-extrabold tracking-tight">
          {headline}
          <span className="text-lg font-semibold text-muted-foreground">/mo</span>
        </div>
        <div className="mb-6 mt-1 text-sm text-muted-foreground">
          {cadence === "annual" && plan.yearlyTotal != null ? (
            <>
              {plan.billedNote} — {formatPrice(plan.yearlyTotal, currency)}/year
            </>
          ) : (
            <>{plan.billedNote}</>
          )}
        </div>
        <ul className="mb-6 space-y-1 text-left">
          {PLAN_FEATURES.map((item) => (
            <li key={item} className="relative pl-6 text-sm">
              <span className="absolute left-0 font-extrabold text-primary">✓</span>
              {item}
            </li>
          ))}
        </ul>
        {waitlistEnabled ? (
          <a
            href="#waitlist"
            className="block w-full rounded-xl bg-primary px-7 py-3 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Get on the waitlist
          </a>
        ) : (
          <a
            href="#opensource"
            className="block w-full rounded-xl border border-border px-7 py-3 text-base font-semibold transition-colors hover:bg-accent"
          >
            Self-host it free
          </a>
        )}
      </div>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        Prices shown in your local currency — same price, no surprise conversions.
        <br />
        Beta users get free access for the duration of the beta. Prefer to run it yourself?{" "}
        <a href="#opensource" className="font-semibold text-primary hover:underline">
          Self-host for free.
        </a>
      </p>
    </div>
  );
}
