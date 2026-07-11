import Holidays from "date-holidays";

export type HolidayType = "public" | "bank" | "school" | "optional" | "observance";

export interface CatalogEntry {
  code: string;
  name: string;
}

export interface ComputedHoliday {
  date: string; // YYYY-MM-DD (calendar date, no time/zone)
  name: string;
  type: HolidayType;
}

/** Default import set: the days a workspace actually closes for. */
const DEFAULT_TYPES: readonly HolidayType[] = ["public", "bank"];
/** Opt-in superset when "Include observances & optional days" is ticked. */
const OBSERVANCE_TYPES: readonly HolidayType[] = [
  "public",
  "bank",
  "optional",
  "school",
  "observance",
];

/** When two holidays land on the same date, keep the most "official" one. */
const TYPE_PRIORITY: readonly HolidayType[] = [
  "public",
  "bank",
  "optional",
  "school",
  "observance",
];

/** All type strings the library is known to emit. Unknown strings are skipped. */
const KNOWN_TYPES = new Set<HolidayType>([
  "public",
  "bank",
  "school",
  "optional",
  "observance",
]);

function toSortedEntries(
  obj: Record<string, string> | undefined,
  lowerCaseKeys = false,
): CatalogEntry[] {
  if (!obj) return [];
  return Object.entries(obj)
    .map(([code, name]) => ({ code: lowerCaseKeys ? code.toLowerCase() : code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function typeRank(t: HolidayType): number {
  const i = TYPE_PRIORITY.indexOf(t);
  return i === -1 ? TYPE_PRIORITY.length : i;
}

/** All supported countries, sorted by display name. */
export function listCountries(): CatalogEntry[] {
  return toSortedEntries(new Holidays().getCountries());
}

/**
 * Subdivisions (states/regions) for a country, or [] if it has none.
 * Codes are normalised to lowercase so callers can pass them back into
 * computeHolidays (the date-holidays constructor accepts both cases).
 * date-holidays *throws* (rather than returning undefined) for an unknown
 * country code, so we treat any failure as "no subdivisions".
 */
export function listSubdivisions(country: string): CatalogEntry[] {
  try {
    return toSortedEntries(new Holidays().getStates(country), true);
  } catch {
    return [];
  }
}

/**
 * Compute the holidays for a region + year, filtered by type, deduped by date
 * (highest-priority type wins), and sorted ascending. Pure + deterministic —
 * `date-holidays` is rule-based and offline, so this computes any year.
 */
export function computeHolidays(
  country: string,
  subdivision: string | null,
  year: number,
  includeObservances: boolean,
): ComputedHoliday[] {
  const hd = subdivision
    ? new Holidays(country, subdivision)
    : new Holidays(country);
  const allowed = new Set<HolidayType>(
    includeObservances ? OBSERVANCE_TYPES : DEFAULT_TYPES,
  );

  const byDate = new Map<string, ComputedHoliday>();
  for (const h of hd.getHolidays(year) ?? []) {
    if (!KNOWN_TYPES.has(h.type as HolidayType)) continue; // drop unknown types safely
    const type = h.type as HolidayType;
    if (!allowed.has(type)) continue;
    const date = h.date.slice(0, 10); // "YYYY-MM-DD HH:mm:ss" -> "YYYY-MM-DD"
    const existing = byDate.get(date);
    if (!existing || typeRank(type) < typeRank(existing.type)) {
      byDate.set(date, { date, name: h.name, type });
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
