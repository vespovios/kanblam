"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type RecurrenceFrequency = "DAILY" | "WEEKLY" | "MONTHLY";

/** Controlled value for the recurrence rule. `endDate` is "" when open-ended. */
export interface RecurrenceValue {
  frequency: RecurrenceFrequency;
  interval: number;
  /** ISO weekdays 1=Mon..7=Sun. Only meaningful for WEEKLY. */
  daysOfWeek: number[];
  /** Recurrence window start, YYYY-MM-DD. */
  startDate: string;
  /** Recurrence window end, YYYY-MM-DD, or "" for indefinite. */
  endDate: string;
}

/**
 * The "Repeat" picker — modelled on Google Calendar / Teams: a single
 * dropdown of presets, with "Custom…" revealing the advanced panel
 * (repeat-every interval, weekday pills, ends-never/on). `value` is
 * `null` for "Does not repeat".
 */

type Preset = "none" | "weekday" | "daily" | "weekly" | "monthly" | "custom";

const PRESET_LABELS: Record<Preset, string> = {
  none: "Does not repeat",
  weekday: "Every weekday (Mon–Fri)",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  custom: "Custom…",
};

// ISO weekdays, Mon-first to match the rest of KanBlam.
const DAY_PILLS: { iso: number; label: string }[] = [
  { iso: 1, label: "M" },
  { iso: 2, label: "T" },
  { iso: 3, label: "W" },
  { iso: 4, label: "T" },
  { iso: 5, label: "F" },
  { iso: 6, label: "S" },
  { iso: 7, label: "S" },
];

const WEEKDAYS = [1, 2, 3, 4, 5];

const UNIT: Record<RecurrenceFrequency, string> = {
  DAILY: "days",
  WEEKLY: "weeks",
  MONTHLY: "months",
};

function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/** Which dropdown preset a value corresponds to (or "custom" if none fit). */
function presetOf(v: RecurrenceValue | null): Preset {
  if (v === null) return "none";
  if (v.frequency === "WEEKLY" && v.interval === 1 && sameSet(v.daysOfWeek, WEEKDAYS))
    return "weekday";
  if (v.frequency === "DAILY" && v.interval === 1) return "daily";
  if (v.frequency === "WEEKLY" && v.interval === 1 && v.daysOfWeek.length === 0)
    return "weekly";
  if (v.frequency === "MONTHLY" && v.interval === 1) return "monthly";
  return "custom";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Props {
  value: RecurrenceValue | null;
  onChange: (v: RecurrenceValue | null) => void;
  /** When false, "Does not repeat" is hidden — for the template edit form,
   *  where a template always recurs. */
  allowNone?: boolean;
}

export function RecurrenceFields({ value, onChange, allowNone = true }: Props) {
  const radioName = useId();
  // Whether the Custom advanced panel is open. Seeded from the incoming
  // value so editing a custom template opens straight into it.
  const [customOpen, setCustomOpen] = useState(() => presetOf(value) === "custom");

  const selected: Preset = customOpen ? "custom" : presetOf(value);

  // Window carried across preset switches (or sensible defaults).
  const win = {
    startDate: value?.startDate || today(),
    endDate: value?.endDate ?? "",
  };

  function applyPreset(p: Preset) {
    if (p === "none") {
      setCustomOpen(false);
      onChange(null);
      return;
    }
    if (p === "custom") {
      setCustomOpen(true);
      // Seed a value if there isn't one yet (was "Does not repeat").
      if (value === null) {
        onChange({ frequency: "DAILY", interval: 1, daysOfWeek: [], ...win });
      }
      return;
    }
    setCustomOpen(false);
    const base = { interval: 1, ...win };
    if (p === "weekday") onChange({ ...base, frequency: "WEEKLY", daysOfWeek: WEEKDAYS });
    else if (p === "daily") onChange({ ...base, frequency: "DAILY", daysOfWeek: [] });
    else if (p === "weekly") onChange({ ...base, frequency: "WEEKLY", daysOfWeek: [] });
    else if (p === "monthly") onChange({ ...base, frequency: "MONTHLY", daysOfWeek: [] });
  }

  // Patch helper for the recurrence card — value is non-null whenever the
  // card renders.
  function patch(p: Partial<RecurrenceValue>) {
    if (value === null) return;
    onChange({ ...value, ...p });
  }

  function toggleDay(iso: number) {
    if (value === null) return;
    const next = value.daysOfWeek.includes(iso)
      ? value.daysOfWeek.filter((d) => d !== iso)
      : [...value.daysOfWeek, iso].sort((a, b) => a - b);
    patch({ daysOfWeek: next });
  }

  const endsMode: "never" | "on" = value && value.endDate ? "on" : "never";

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs">Repeat</Label>
        <Select value={selected} onValueChange={(v) => v && applyPreset(v as Preset)}>
          <SelectTrigger className="w-full">
            <SelectValue>
              {(v: string) => PRESET_LABELS[v as Preset] ?? PRESET_LABELS.none}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {allowNone && <SelectItem value="none">Does not repeat</SelectItem>}
            <SelectItem value="weekday">Every weekday (Mon–Fri)</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="custom">Custom…</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {value !== null && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
          {customOpen && (
            <>
              {/* Repeat every [N] [unit] */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">
                  Repeat every
                </span>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={value.interval}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => patch({ interval: Number(e.target.value) || 1 })}
                  className="w-16 shrink-0"
                  aria-label="Repeat interval"
                />
                <Select
                  value={value.frequency}
                  onValueChange={(v) => {
                    if (!v) return;
                    const freq = v as RecurrenceFrequency;
                    patch({
                      frequency: freq,
                      daysOfWeek: freq === "WEEKLY" ? value.daysOfWeek : [],
                    });
                  }}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue>
                      {(v: string) => UNIT[v as RecurrenceFrequency] ?? "days"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAILY">days</SelectItem>
                    <SelectItem value="WEEKLY">weeks</SelectItem>
                    <SelectItem value="MONTHLY">months</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Repeat on — weekday pills (WEEKLY only) */}
              {value.frequency === "WEEKLY" && (
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">Repeat on</span>
                  <div className="flex gap-1.5">
                    {DAY_PILLS.map((d, i) => {
                      const on = value.daysOfWeek.includes(d.iso);
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => toggleDay(d.iso)}
                          aria-pressed={on}
                          aria-label={`Weekday ${d.iso}`}
                          className={cn(
                            "size-7 rounded-full text-xs font-medium transition-colors",
                            on
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-secondary",
                          )}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Starts */}
          <div className="space-y-1">
            <Label htmlFor="rec-start" className="text-xs">
              Starts
            </Label>
            <Input
              id="rec-start"
              type="date"
              value={value.startDate}
              onChange={(e) => patch({ startDate: e.target.value })}
              className="w-44"
            />
          </div>

          {/* Ends — Never / On [date]. KanBlam's model has no occurrence
              count, so the "After N occurrences" option Google offers is
              intentionally not here. */}
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Ends</span>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
                <input
                  type="radio"
                  name={radioName}
                  checked={endsMode === "never"}
                  onChange={() => patch({ endDate: "" })}
                />
                Never
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name={radioName}
                  checked={endsMode === "on"}
                  onChange={() =>
                    patch({ endDate: value.endDate || value.startDate })
                  }
                />
                On
                <Input
                  type="date"
                  value={value.endDate}
                  disabled={endsMode === "never"}
                  onChange={(e) => patch({ endDate: e.target.value })}
                  className="w-40"
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
