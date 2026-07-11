import { describe, it, expect } from "vitest";
import { loginSchema, signupSchema } from "@/lib/validators/auth";

describe("loginSchema", () => {
  it("accepts valid email and password", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "a-good-password",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "x" });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "" });
    expect(result.success).toBe(false);
  });

  // qa#8 — login messages must be human-readable, not zod schema-speak.
  it("uses human-readable validation messages on the login form fields", () => {
    const result = loginSchema.safeParse({ email: "", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const byPath = Object.fromEntries(
        result.error.issues.map((i) => [i.path.join("."), i.message]),
      );
      expect(byPath.email).toBe("Email is required");
      expect(byPath.password).toBe("Password is required");
    }

    const bad = loginSchema.safeParse({ email: "not-an-email", password: "x" });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const emailMsg = bad.error.issues.find(
        (i) => i.path.join(".") === "email",
      )?.message;
      expect(emailMsg).toBe("Enter a valid email address");
    }
  });
});

describe("signupSchema", () => {
  it("accepts valid name, password, and token", () => {
    const result = signupSchema.safeParse({
      name: "Jane",
      password: "a-good-password",
      token: "a".repeat(64),
    });
    expect(result.success).toBe(true);
  });

  it("rejects password shorter than 8 chars", () => {
    const result = signupSchema.safeParse({ name: "Jane", password: "short", token: "a".repeat(64) });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const result = signupSchema.safeParse({ name: "", password: "a-good-password", token: "a".repeat(64) });
    expect(result.success).toBe(false);
  });
});
