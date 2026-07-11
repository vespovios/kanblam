import { describe, it, expect } from "vitest";
import { inviteEmail } from "@/lib/email/templates";

describe("inviteEmail", () => {
  it("renders HTML with the signup link", () => {
    const { html, text, subject } = inviteEmail({
      workspaceName: "Acme",
      signupUrl: "https://tasker.example.com/signup?token=abc",
      invitedBy: "Peter",
    });
    expect(html).toContain("https://tasker.example.com/signup?token=abc");
    expect(html).toContain("Acme");
    expect(html).toContain("Peter");
    expect(text).toContain("https://tasker.example.com/signup?token=abc");
    expect(subject).toMatch(/invited/i);
  });
});
