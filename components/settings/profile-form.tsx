"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  /** Current display name from the server. Email is shown read-only. */
  initialName: string;
  email: string;
}

/** Self-service profile edit. Today: just the display name. Email is
 *  rendered read-only — changing it requires a verification flow which
 *  hasn't shipped yet. */
export function ProfileForm({ initialName, email }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();
  const dirty = trimmed !== initialName;
  const tooLong = trimmed.length > 100;
  const tooShort = trimmed.length === 0;
  const disabled = saving || !dirty || tooLong || tooShort;

  async function save() {
    setSaving(true);
    const res = await fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error ?? "Failed to save profile");
      return;
    }
    toast.success("Profile updated");
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h3 className="font-semibold">Profile</h3>
        <p className="text-sm text-muted-foreground">
          Your display name shows up on tasks you create or are assigned to,
          and in the topbar avatar.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-name" className="text-xs">Name</Label>
        <Input
          id="profile-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          placeholder="e.g. Peter"
          aria-invalid={tooLong || (dirty && tooShort) ? true : undefined}
          aria-describedby={tooLong ? "profile-name-error" : undefined}
        />
        {tooLong && (
          <p id="profile-name-error" role="alert" className="text-sm text-destructive">
            Name must be 100 characters or fewer.
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-email" className="text-xs">Email</Label>
        <Input
          id="profile-email"
          value={email}
          readOnly
          disabled
          className="bg-muted/40 cursor-not-allowed"
        />
        <p className="text-xs text-muted-foreground">
          Email isn&apos;t editable from here yet — needs a verification flow
          we haven&apos;t shipped (Phase 1).
        </p>
      </div>
      <Button onClick={save} disabled={disabled}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
