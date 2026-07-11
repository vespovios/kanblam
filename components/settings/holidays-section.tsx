"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatShortDate } from "@/lib/dates/format";
import { HolidayImport } from "@/components/settings/holiday-import";

interface Holiday {
  id: string;
  name: string;
  date: string; // ISO
}

export function HolidaysSection({
  initial,
  initialCountry,
  initialSubdivision,
}: {
  initial: Holiday[];
  initialCountry: string | null;
  initialSubdivision: string | null;
}) {
  const router = useRouter();
  const [list, setList] = useState(initial);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [adding, setAdding] = useState(false);

  async function add() {
    if (!name.trim() || !date) return;
    setAdding(true);
    const res = await fetch("/api/holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), date }),
    });
    setAdding(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to add");
      return;
    }
    const data = await res.json();
    setList((l) => [...l, { id: data.holiday.id, name: data.holiday.name, date: data.holiday.date }].sort(
      (a, b) => a.date.localeCompare(b.date),
    ));
    setName("");
    setDate("");
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this holiday?")) return;
    const res = await fetch(`/api/holidays/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete");
      return;
    }
    setList((l) => l.filter((h) => h.id !== id));
    router.refresh();
  }

  function mergeImported(rows: Holiday[]) {
    setList((l) => {
      const byId = new Map(l.map((h) => [h.id, h]));
      for (const r of rows) byId.set(r.id, { id: r.id, name: r.name, date: r.date });
      return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
    });
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div>
        <h3 className="font-semibold">Holidays</h3>
        <p className="text-sm text-muted-foreground">Days skipped by the working-day calculation.</p>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
        <div className="space-y-1">
          <Label htmlFor="holiday-name">Name</Label>
          <Input id="holiday-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Christmas" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="holiday-date">Date</Label>
          <Input id="holiday-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Button onClick={add} disabled={adding || !name.trim() || !date}>
          {adding ? "Adding..." : "Add"}
        </Button>
      </div>
      <HolidayImport
        initialCountry={initialCountry}
        initialSubdivision={initialSubdivision}
        onImported={mergeImported}
      />
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No holidays yet.</p>
      ) : (
        <ul className="divide-y">
          {list.map((h) => (
            <li key={h.id} className="py-2 flex items-center justify-between text-sm">
              <div>
                <span className="font-medium">{h.name}</span>{" "}
                <span className="text-muted-foreground">{formatShortDate(h.date)}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => remove(h.id)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
