import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LandingPage } from "@/components/marketing/landing-page";
import { features } from "@/lib/config/features";
import {
  CURRENCY_COOKIE,
  currencyForCountry,
  isCurrencyCode,
  type CurrencyCode,
} from "@/lib/marketing/pricing";

/**
 * Resolve the visitor's display currency, in priority order:
 *   1. A saved `kb_currency` cookie (their explicit switcher choice).
 *   2. Cloudflare's `cf-ipcountry` geo header → currency map.
 *   3. GBP fallback (handled inside `currencyForCountry`).
 */
async function resolveCurrency(): Promise<CurrencyCode> {
  const saved = (await cookies()).get(CURRENCY_COOKIE)?.value;
  if (isCurrencyCode(saved)) return saved;

  const country = (await headers()).get("cf-ipcountry");
  return currencyForCountry(country);
}

export default async function RootPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  // Self-host deploys (LANDING_MODE=app) skip the SaaS marketing landing
  // entirely — logged-out visitors go straight to /login. SaaS keeps the
  // marketing page with waitlist signup.
  if (features.landingMode === "app") redirect("/login");

  const currency = await resolveCurrency();

  return <LandingPage waitlistEnabled={features.waitlistEnabled} currency={currency} />;
}
