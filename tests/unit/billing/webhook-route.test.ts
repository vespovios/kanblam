import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mutable flag mirror (same pattern as billing-checkout.test.ts / polar.test.ts).
vi.mock("@/lib/config/features", () => ({ features: { billingEnabled: false } }));

// A fake WebhookVerificationError class the route can `instanceof`-check, plus a
// mockable validateEvent. Both must come from the same mocked module instance.
// Defined via `vi.hoisted` so it exists before the hoisted `vi.mock` factory
// runs (a bare `class` declaration would be in its TDZ at hoist time).
const { FakeVerificationError } = vi.hoisted(() => {
  class FakeVerificationError extends Error {}
  return { FakeVerificationError };
});
vi.mock("@polar-sh/sdk/webhooks", () => ({
  validateEvent: vi.fn(),
  WebhookVerificationError: FakeVerificationError,
}));

// Mock the handler seam so the route test never touches the DB.
vi.mock("@/lib/billing/webhook-handlers", () => ({ processWebhookEvent: vi.fn() }));

import { features } from "@/lib/config/features";
import { validateEvent } from "@polar-sh/sdk/webhooks";
import { processWebhookEvent } from "@/lib/billing/webhook-handlers";

function setBilling(enabled: boolean) {
  (features as { billingEnabled: boolean }).billingEnabled = enabled;
}

const ORIGINAL_ENV = { ...process.env };

function post(headers: Record<string, string> = {}, body = '{"type":"subscription.active","data":{}}') {
  return new Request("http://localhost/api/billing/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

const SIGNED_HEADERS = {
  "webhook-id": "msg_test_1",
  "webhook-timestamp": "1700000000",
  "webhook-signature": "v1,placeholder-signature",
};

beforeEach(() => {
  setBilling(true);
  process.env.POLAR_WEBHOOK_SECRET = "test-webhook-secret";
  vi.mocked(processWebhookEvent).mockResolvedValue({
    duplicate: false,
    processed: true,
    workspaceId: "ws_1",
  });
  vi.mocked(validateEvent).mockReturnValue({ type: "subscription.active", data: {} } as never);
});

afterEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe("POST /api/billing/webhook — flag + config gating", () => {
  it("returns 404 when billing is disabled (self-host invariant)", async () => {
    setBilling(false);
    const { POST } = await import("@/app/api/billing/webhook/route");
    const res = await POST(post(SIGNED_HEADERS));
    expect(res.status).toBe(404);
    expect(validateEvent).not.toHaveBeenCalled();
    expect(processWebhookEvent).not.toHaveBeenCalled();
  });

  it("fails closed with 500 when POLAR_WEBHOOK_SECRET is unset", async () => {
    delete process.env.POLAR_WEBHOOK_SECRET;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("@/app/api/billing/webhook/route");
    const res = await POST(post(SIGNED_HEADERS));
    expect(res.status).toBe(500);
    expect(validateEvent).not.toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("POST /api/billing/webhook — signature validation", () => {
  it("valid signature ⇒ 200 and the event is processed", async () => {
    const { POST } = await import("@/app/api/billing/webhook/route");
    const res = await POST(post(SIGNED_HEADERS));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(processWebhookEvent).toHaveBeenCalledTimes(1);
    expect(processWebhookEvent).toHaveBeenCalledWith(
      { type: "subscription.active", data: {} },
      "msg_test_1",
      expect.objectContaining({ rawPayload: expect.anything() }),
    );
  });

  it("invalid signature ⇒ 403, never processed", async () => {
    vi.mocked(validateEvent).mockImplementation(() => {
      throw new FakeVerificationError("bad signature");
    });
    const { POST } = await import("@/app/api/billing/webhook/route");
    const res = await POST(post(SIGNED_HEADERS));
    expect(res.status).toBe(403);
    expect(processWebhookEvent).not.toHaveBeenCalled();
  });

  it("missing signature header ⇒ 403, never processed", async () => {
    // Standard-Webhooks rejects a body with no signature header.
    vi.mocked(validateEvent).mockImplementation(() => {
      throw new FakeVerificationError("missing signature");
    });
    const { POST } = await import("@/app/api/billing/webhook/route");
    const res = await POST(post({ "webhook-id": "msg_test_1" }));
    expect(res.status).toBe(403);
    expect(processWebhookEvent).not.toHaveBeenCalled();
  });

  it("valid signature but missing webhook-id ⇒ 400", async () => {
    const { POST } = await import("@/app/api/billing/webhook/route");
    const res = await POST(post({ "webhook-signature": "v1,x", "webhook-timestamp": "1700000000" }));
    expect(res.status).toBe(400);
    expect(processWebhookEvent).not.toHaveBeenCalled();
  });
});
