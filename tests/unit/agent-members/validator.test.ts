import { describe, it, expect, afterEach } from "vitest";
import {
  createAgentMemberSchema,
  agentMembersMax,
  AGENT_MEMBERS_DEFAULT_MAX,
  AGENT_EMAIL_DOMAIN,
} from "@/lib/validators/agent-member";

describe("agent-member validator", () => {
  afterEach(() => {
    delete process.env.AGENT_MEMBERS_MAX;
  });

  it("requires a non-empty trimmed name, max 100", () => {
    expect(createAgentMemberSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(createAgentMemberSchema.safeParse({ name: "x".repeat(101) }).success).toBe(false);
    const ok = createAgentMemberSchema.safeParse({ name: "  Flight Computer  " });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.name).toBe("Flight Computer");
  });

  it("cap defaults to 5 and reads AGENT_MEMBERS_MAX", () => {
    expect(AGENT_MEMBERS_DEFAULT_MAX).toBe(5);
    expect(agentMembersMax()).toBe(5);
    process.env.AGENT_MEMBERS_MAX = "12";
    expect(agentMembersMax()).toBe(12);
    process.env.AGENT_MEMBERS_MAX = "0";      // invalid → default
    expect(agentMembersMax()).toBe(5);
    process.env.AGENT_MEMBERS_MAX = "nope";   // invalid → default
    expect(agentMembersMax()).toBe(5);
  });

  it("exports the reserved domain", () => {
    expect(AGENT_EMAIL_DOMAIN).toBe("agents.internal");
  });
});
