"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const DAYS: { iso: number; short: string }[] = [
  { iso: 1, short: "Mon" },
  { iso: 2, short: "Tue" },
  { iso: 3, short: "Wed" },
  { iso: 4, short: "Thu" },
  { iso: 5, short: "Fri" },
  { iso: 6, short: "Sat" },
  { iso: 7, short: "Sun" },
];

export function WorkingDaysForm({ initial }: { initial: number[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<number[]>([...initial].sort((a, b) => a - b));
  const [saving, setSaving] = useState(false);

  function toggle(iso: number) {
    setSelected((s) => (s.includes(iso) ? s.filter((x) => x !== iso) : [...s, iso].sort((a, b) => a - b)));
  }

  async function save() {
    setSaving(true);
    const res = await fetch("/api/settings/working-days", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workingDays: selected }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("Failed to save");
      return;
    }
    toast.success("Working days updated");
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h3 className="font-semibold">Working days</h3>
        <p className="text-sm text-muted-foreground">Days counted for &quot;overdue&quot; and &quot;due today&quot; on the dashboard.</p>
      </div>
      <div className="flex flex-wrap gap-4">
        {DAYS.map((d) => (
          <label key={d.iso} className="flex items-center gap-2">
            <Checkbox
              checked={selected.includes(d.iso)}
              onCheckedChange={() => toggle(d.iso)}
            />
            <Label>{d.short}</Label>
          </label>
        ))}
      </div>
      <Button onClick={save} disabled={saving || selected.length === 0}>
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
