"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { BillingCadence } from "@/lib/billing/products";

interface Props {
  /** Button label — "Subscribe" for a fresh workspace, "Reactivate
   *  subscription" when a lapsed (read-only/suspended) workspace re-subscribes. */
  label?: string;
}

/**
 * Monthly/annual selector + checkout button. Posts to `POST /api/billing/checkout`
 * and redirects the browser to the returned hosted Polar checkout `url`.
 *
 * The only hosted tier today is `hosted_standard` (see `@/lib/billing/products`);
 * the cadence toggle is the only choice. Used by the Settings → Billing page for
 * the NONE / READ_ONLY / SUSPENDED states.
 */
export function SubscribeForm({ label = "Subscribe" }: Props) {
  const [cadence, setCadence] = useState<BillingCadence>("monthly");
  const [loading, setLoading] = useState(false);

  async function subscribe() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "hosted_standard", cadence }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.url) {
        toast.error(body?.error ?? "Could not start checkout");
        setLoading(false);
        return;
      }
      // Hand off to Polar's hosted checkout.
      window.location.href = body.url as string;
    } catch {
      toast.error("Could not start checkout");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div
        role="radiogroup"
        aria-label="Billing cadence"
        className="inline-flex rounded-md border p-0.5"
      >
        <button
          type="button"
          role="radio"
          aria-checked={cadence === "monthly"}
          onClick={() => setCadence("monthly")}
          className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            cadence === "monthly"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={cadence === "annual"}
          onClick={() => setCadence("annual")}
          className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            cadence === "annual"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Annual
        </button>
      </div>
      <div>
        <Button onClick={subscribe} disabled={loading}>
          {loading ? "Redirecting…" : label}
        </Button>
      </div>
    </div>
  );
}
