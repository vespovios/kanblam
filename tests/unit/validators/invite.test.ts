import { describe, it, expect } from "vitest";
import { createInviteSchema } from "@/lib/validators/invite";

describe("createInviteSchema", () => {
  it("accepts a valid email", () => {
    const result = createInviteSchema.safeParse({ email: "new@example.com" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = createInviteSchema.safeParse({ email: "nope" });
    expect(result.success).toBe(false);
  });

  it("lowercases the email", () => {
    const result = createInviteSchema.parse({ email: "MIXED@Example.COM" });
    expect(result.email).toBe("mixed@example.com");
  });
});
