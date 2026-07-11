"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordFormSchema, type ChangePasswordFormInput } from "@/lib/validators/auth";

/** Self-service password change. Every authenticated user can use it
 *  (Settings page is `requireUser`, not `requireAdmin`, since v0.7.0). */
export function PasswordForm() {
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ChangePasswordFormInput>({
    resolver: zodResolver(changePasswordFormSchema),
  });

  async function onSubmit(values: ChangePasswordFormInput) {
    setSubmitting(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      // Surface server-side field errors on the right field — e.g. "current
      // password is incorrect" lands on the currentPassword input via the
      // `field` hint the route emits.
      if (body?.field === "currentPassword") {
        setError("currentPassword", { type: "server", message: body.error });
        return;
      }
      toast.error(body?.error ?? "Failed to change password");
      return;
    }
    reset();
    toast.success("Password updated");
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h3 className="font-semibold">Password</h3>
        <p className="text-sm text-muted-foreground">
          Change the password you use to log in.
        </p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="current-password" className="text-xs">Current password</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            aria-invalid={errors.currentPassword ? true : undefined}
            aria-describedby={errors.currentPassword ? "current-password-error" : undefined}
            {...register("currentPassword")}
          />
          {errors.currentPassword && (
            <p id="current-password-error" role="alert" className="text-sm text-destructive">
              {errors.currentPassword.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-password" className="text-xs">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={errors.newPassword ? true : undefined}
            aria-describedby={errors.newPassword ? "new-password-error" : undefined}
            {...register("newPassword")}
          />
          {errors.newPassword && (
            <p id="new-password-error" role="alert" className="text-sm text-destructive">
              {errors.newPassword.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm-new-password" className="text-xs">Confirm new password</Label>
          <Input
            id="confirm-new-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={errors.confirmNewPassword ? true : undefined}
            aria-describedby={errors.confirmNewPassword ? "confirm-new-password-error" : undefined}
            {...register("confirmNewPassword")}
          />
          {errors.confirmNewPassword && (
            <p id="confirm-new-password-error" role="alert" className="text-sm text-destructive">
              {errors.confirmNewPassword.message}
            </p>
          )}
        </div>

        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Update password"}
        </Button>
      </form>
    </div>
  );
}
