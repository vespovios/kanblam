/**
 * Marketing pricing + currency model (public landing page only).
 *
 * Mirrors the *display* side of the Polar.sh billing config (pricing decision
 * **D4**): one hosted "Standard" plan, billed monthly or annually, priced
 * Apple-style — **same digits, local symbol, no FX conversion**. The real
 * charge happens in Polar; this module only decides what number + symbol a
 * visitor sees on the marketing page so it matches what they'll be charged.
 *
 *   - Monthly cadence: 2.99 / month, billed monthly.
 *   - Annual cadence:  1.99 / month effective, billed once a year.
 *
 * Five configured currencies (USD / CAD / AUD / GBP / EUR) with **GBP as the
 * fallback** for any region that doesn't map — same fallback Polar uses.
 *
 * ⚠️ Source-of-truth note: the authoritative prices live in Polar's dashboard.
 * The annual *yearly total* below is computed as 12 × the annual per-month
 * figure (1.99 → 23.88). If Polar bills annual at a rounded number instead,
 * change `ANNUAL_PER_MONTH` / add an explicit `annualTotal` here so the page
 * and the checkout never disagree.
 */

export type CurrencyCode = "USD" | "CAD" | "AUD" | "GBP" | "EUR";

export interface Currency {
  code: CurrencyCode;
  /** Symbol shown before the amount (Apple-style, symbol-first for all). */
  symbol: string;
  /** Short label for the switcher, e.g. "USD $". */
  label: string;
}

/** The five currencies Polar is configured for. Order = switcher order. */
export const CURRENCIES: Record<CurrencyCode, Currency> = {
  USD: { code: "USD", symbol: "$", label: "USD $" },
  GBP: { code: "GBP", symbol: "£", label: "GBP £" },
  EUR: { code: "EUR", symbol: "€", label: "EUR €" },
  CAD: { code: "CAD", symbol: "CA$", label: "CAD CA$" },
  AUD: { code: "AUD", symbol: "A$", label: "AUD A$" },
};

/** GBP is the fallback when a region doesn't map to a configured currency. */
export const FALLBACK_CURRENCY: CurrencyCode = "GBP";

export const CURRENCY_COOKIE = "kb_currency";

/** D4 price digits — identical across every currency (no FX conversion). */
const MONTHLY_BILLED = 2.99; // billed monthly
const ANNUAL_PER_MONTH = 1.99; // effective per-month when billed annually
const ANNUAL_TOTAL = +(ANNUAL_PER_MONTH * 12).toFixed(2); // 23.88

export type BillingCadence = "monthly" | "annual";

export interface PriceView {
  /** The big headline number, always expressed per-month. */
  perMonth: number;
  /** Sub-line: how it's billed. */
  billedNote: string;
  /** Yearly total for the annual plan; null for monthly. */
  yearlyTotal: number | null;
}

/** Plan digits per cadence — currency-independent (symbol applied at render). */
export const PLAN: Record<BillingCadence, PriceView> = {
  monthly: { perMonth: MONTHLY_BILLED, billedNote: "billed monthly", yearlyTotal: null },
  annual: { perMonth: ANNUAL_PER_MONTH, billedNote: "billed annually", yearlyTotal: ANNUAL_TOTAL },
};

/**
 * Format an amount with a currency's symbol, Apple-style: symbol first, the
 * same digits everywhere. Trailing ".00" is dropped (so 23.88 stays, a whole
 * number would show clean).
 */
export function formatPrice(amount: number, code: CurrencyCode): string {
  const { symbol } = CURRENCIES[code];
  const digits = Number.isInteger(amount) ? amount.toString() : amount.toFixed(2);
  return `${symbol}${digits}`;
}

/**
 * ISO-3166 alpha-2 country → currency. Anything not listed (including the whole
 * eurozone's neighbours, RoW) falls back to GBP. Eurozone members are listed
 * explicitly; the UK/US/CA/AU map to their own currency.
 */
const COUNTRY_TO_CURRENCY: Record<string, CurrencyCode> = {
  US: "USD",
  GB: "GBP",
  CA: "CAD",
  AU: "AUD",
  // Eurozone (EUR official currency)
  AT: "EUR", BE: "EUR", HR: "EUR", CY: "EUR", EE: "EUR", FI: "EUR",
  FR: "EUR", DE: "EUR", GR: "EUR", IE: "EUR", IT: "EUR", LV: "EUR",
  LT: "EUR", LU: "EUR", MT: "EUR", NL: "EUR", PT: "EUR", SK: "EUR",
  SI: "EUR", ES: "EUR",
};

/**
 * Resolve a visitor's display currency from a country code (e.g. Cloudflare's
 * `cf-ipcountry` header). Case-insensitive; unknown / missing → GBP fallback.
 */
export function currencyForCountry(country: string | null | undefined): CurrencyCode {
  if (!country) return FALLBACK_CURRENCY;
  return COUNTRY_TO_CURRENCY[country.trim().toUpperCase()] ?? FALLBACK_CURRENCY;
}

/** Narrow an arbitrary string (e.g. a cookie value) to a known currency. */
export function isCurrencyCode(value: string | null | undefined): value is CurrencyCode {
  return value != null && value in CURRENCIES;
}
