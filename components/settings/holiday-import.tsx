"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatShortDate } from "@/lib/dates/format";

interface ImportedHoliday {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
}

interface CatalogEntry {
  code: string;
  name: string;
}

interface Candidate {
  date: string;
  name: string;
  type: string;
  exists: boolean;
}

export function HolidayImport({
  initialCountry,
  initialSubdivision,
  onImported,
}: {
  initialCountry: string | null;
  initialSubdivision: string | null;
  onImported: (rows: ImportedHoliday[]) => void;
}) {
  const router = useRouter();
  const thisYear = new Date().getFullYear();

  const [open, setOpen] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [countries, setCountries] = useState<CatalogEntry[]>([]);
  const [subdivisions, setSubdivisions] = useState<CatalogEntry[]>([]);
  const [country, setCountry] = useState(initialCountry ?? "");
  const [subdivision, setSubdivision] = useState(initialSubdivision ?? "");
  const [year, setYear] = useState(thisYear);
  const [includeObservances, setIncludeObservances] = useState(false);

  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);

  async function fetchOptions(forCountry: string) {
    setLoadingOptions(true);
    const qs = forCountry ? `?country=${encodeURIComponent(forCountry)}` : "";
    const res = await fetch(`/api/holidays/import/options${qs}`);
    setLoadingOptions(false);
    if (!res.ok) {
      toast.error("Could not load country list");
      return;
    }
    const data = await res.json();
    setCountries(data.countries);
    setSubdivisions(data.subdivisions);
  }

  async function openPanel() {
    setOpen(true);
    if (countries.length === 0) await fetchOptions(country);
  }

  async function onCountryChange(next: string) {
    setCountry(next);
    setSubdivision("");
    setCandidates(null);
    setSubdivisions([]);
    if (next) await fetchOptions(next);
  }

  async function preview() {
    if (!country) return;
    setPreviewing(true);
    setCandidates(null);
    const res = await fetch("/api/holidays/import/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        country,
        subdivision: subdivision || null,
        year,
        includeObservances,
      }),
    });
    setPreviewing(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Preview failed");
      return;
    }
    const data: { candidates: Candidate[] } = await res.json();
    setCandidates(data.candidates);
    setSelected(new Set(data.candidates.filter((c) => !c.exists).map((c) => c.date)));
  }

  function toggle(date: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  async function commit() {
    if (selected.size === 0) return;
    setImporting(true);
    const res = await fetch("/api/holidays/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        country,
        subdivision: subdivision || null,
        year,
        includeObservances,
        selectedDates: [...selected],
      }),
    });
    setImporting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Import failed");
      return;
    }
    const data: { imported: number; skipped: number; holidays: ImportedHoliday[] } =
      await res.json();
    onImported(data.holidays);
    toast.success(
      `Imported ${data.imported} holiday${data.imported === 1 ? "" : "s"}` +
        (data.skipped > 0 ? ` (${data.skipped} already present, skipped)` : ""),
    );
    setCandidates(null);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={openPanel}>
        Import public holidays
      </Button>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">Import public holidays</h4>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="hi-country">Country</Label>
          <select
            id="hi-country"
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={country}
            disabled={loadingOptions}
            onChange={(e) => onCountryChange(e.target.value)}
          >
            <option value="">Select a country…</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="hi-sub">Region / state</Label>
          <select
            id="hi-sub"
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={subdivision}
            disabled={!country || subdivisions.length === 0}
            onChange={(e) => {
              setSubdivision(e.target.value);
              setCandidates(null);
            }}
          >
            <option value="">
              {subdivisions.length === 0 ? "Whole country" : "Whole country / none"}
            </option>
            {subdivisions.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="hi-year">Year</Label>
          <select
            id="hi-year"
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={year}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setCandidates(null);
            }}
          >
            {[thisYear, thisYear + 1, thisYear + 2].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={includeObservances}
          onChange={(e) => {
            setIncludeObservances(e.target.checked);
            setCandidates(null);
          }}
        />
        Include observances &amp; optional days (default: public &amp; bank holidays only)
      </label>

      <Button size="sm" onClick={preview} disabled={!country || previewing}>
        {previewing ? "Loading…" : "Preview"}
      </Button>

      {candidates && (
        <div className="space-y-3">
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No holidays found for that selection.
            </p>
          ) : (
            <>
              <ul className="max-h-72 divide-y overflow-auto rounded-md border bg-background">
                {candidates.map((c) => (
                  <li key={c.date} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      aria-label={`${c.name} (${formatShortDate(c.date)})${c.exists ? " — already added" : ""}`}
                      checked={selected.has(c.date)}
                      disabled={c.exists}
                      onChange={() => toggle(c.date)}
                    />
                    <span className="w-24 text-muted-foreground">
                      {formatShortDate(c.date)}
                    </span>
                    <span className="flex-1 font-medium">{c.name}</span>
                    <span className="text-xs uppercase text-muted-foreground">{c.type}</span>
                    {c.exists && (
                      <span className="text-xs text-muted-foreground">Already added</span>
                    )}
                  </li>
                ))}
              </ul>
              <Button size="sm" onClick={commit} disabled={selected.size === 0 || importing}>
                {importing ? "Importing…" : `Import ${selected.size} selected`}
              </Button>
            </>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Holiday data from the{" "}
        <a
          href="https://github.com/commenthol/date-holidays"
          className="underline underline-offset-2"
          target="_blank"
          rel="noreferrer"
        >
          date-holidays
        </a>{" "}
        project, licensed CC BY-SA 3.0. Computed dates may not reflect later law
        changes — refresh after upgrading the package.
      </p>
    </div>
  );
}
