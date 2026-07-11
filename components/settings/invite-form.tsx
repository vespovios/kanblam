"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createInviteSchema, type CreateInviteInput } from "@/lib/validators/invite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function InviteForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateInviteInput>({ resolver: zodResolver(createInviteSchema) });

  async function onSubmit(values: CreateInviteInput) {
    setLoading(true);
    const res = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to send invite");
      return;
    }
    toast.success(`Invite sent to ${values.email}`);
    reset();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex items-end gap-2 max-w-md">
      <div className="flex-1 space-y-2">
        <Label htmlFor="invite-email">Invite by email</Label>
        <Input id="invite-email" type="email" placeholder="teammate@example.com" {...register("email")} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? "Sending..." : "Send invite"}
      </Button>
    </form>
  );
}
