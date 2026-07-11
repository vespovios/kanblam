import { z } from "zod";

// Human-readable validation messages — these are shown directly to users in
// the login / signup forms, so the defaults (zod's "Too small: expected
// string to have >=1 characters") would leak schema-speak into the UI (qa#8).
// `.pipe()` so the "required" check fires before the "valid email" check
// on empty input — otherwise zod v4 surfaces the email-format error for "".
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .pipe(z.string().email("Enter a valid email address")),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name is too long"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200, "Password is too long"),
  token: z.string().length(64, "Invalid invite token"),
});

export type SignupInput = z.infer<typeof signupSchema>;

/** A new password must be reasonable strength. 8 chars is the floor; we
 *  rely on bcrypt + rate-limiting to keep brute-force impractical rather
 *  than complexity rules (which users defeat with `Password1!`). */
const newPasswordField = z
  .string()
  .min(8, "New password must be at least 8 characters")
  .max(200, "New password is too long");

const baseChangePassword = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(200),
  newPassword: newPasswordField,
});

/** WIRE schema — what the server validates on POST /api/auth/change-password.
 *  Client-only fields like `confirmNewPassword` don't appear here. */
export const changePasswordSchema = baseChangePassword.refine(
  (data) => data.newPassword !== data.currentPassword,
  { message: "New password must differ from current password", path: ["newPassword"] },
);

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** FORM schema — adds the client-only "confirm new password" field with a
 *  matching refine. The form resolver uses this; submission strips the
 *  confirm field and POSTs the wire shape. */
export const changePasswordFormSchema = baseChangePassword
  .extend({ confirmNewPassword: z.string().min(1, "Please re-type the new password") })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "New password must differ from current password",
    path: ["newPassword"],
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "Passwords don't match",
    path: ["confirmNewPassword"],
  });

export type ChangePasswordFormInput = z.infer<typeof changePasswordFormSchema>;

/** Profile-edit schema (just the display name today). Email is intentionally
 *  not editable from this surface — changing it requires a verification
 *  flow we haven't shipped yet (Phase 1). */
export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or fewer"),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
