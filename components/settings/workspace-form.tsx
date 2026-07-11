"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  initial: string;
}

/** Workspace rename form. Admin-only path is enforced server-side; this
 *  component is only rendered for admins by the Settings page. Mirrors the
 *  WorkingDaysForm pattern (PATCH → router.refresh → toast). */
export function WorkspaceForm({ initial }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();
  const dirty = trimmed !== initial;
  const tooLong = trimmed.length > 100;
  const tooShort = trimmed.length === 0;
  const disabled = saving || !dirty || tooLong || tooShort;

  async function save() {
    setSaving(true);
    const res = await fetch("/api/settings/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error ?? "Failed to save workspace name");
      return;
    }
    toast.success("Workspace name updated");
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h3 className="font-semibold">Workspace</h3>
        <p className="text-sm text-muted-foreground">
          The name shown in the topbar pill on every page.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="workspace-name">Name</Label>
        <Input
          id="workspace-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          placeholder="e.g. The Pugh Family"
          aria-invalid={tooLong || (dirty && tooShort) ? true : undefined}
          aria-describedby={tooLong ? "workspace-name-error" : undefined}
        />
        {tooLong && (
          <p id="workspace-name-error" role="alert" className="text-sm text-destructive">
            Workspace name must be 100 characters or fewer.
          </p>
        )}
      </div>
      <Button onClick={save} disabled={disabled}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
