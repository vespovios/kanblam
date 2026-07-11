"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Props {
  /** Button label — "Manage subscription", "Update payment method", or
   *  "Resume subscription" depending on the billing state. */
  label: string;
  variant?: "default" | "outline";
}

/**
 * Opens the Polar customer portal. Posts to `POST /api/billing/portal` and
 * redirects the browser to the returned single-use `customerPortalUrl`.
 *
 * Used by the Settings → Billing page for the TRIALING / ACTIVE / PAST_DUE /
 * CANCELED states (manage, update payment, resume).
 */
export function PortalButton({ label, variant = "default" }: Props) {
  const [loading, setLoading] = useState(false);

  async function openPortal() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.url) {
        toast.error(body?.error ?? "Could not open billing portal");
        setLoading(false);
        return;
      }
      window.location.href = body.url as string;
    } catch {
      toast.error("Could not open billing portal");
      setLoading(false);
    }
  }

  return (
    <Button onClick={openPortal} disabled={loading} variant={variant}>
      {loading ? "Opening…" : label}
    </Button>
  );
}
