import { NextResponse } from "next/server";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { features } from "@/lib/config/features";
import { processWebhookEvent, type WebhookEvent } from "@/lib/billing/webhook-handlers";

/**
 * POST /api/billing/webhook — Polar Standard-Webhooks receiver.
 *
 * The sync core: Polar posts subscription/order/customer events here; we verify
 * the signature, record the event idempotently, and reconcile `WorkspaceBilling`
 * (see `@/lib/billing/webhook-handlers`).
 *
 * Guardrails (see `the billing design notes (2026-05-24, private archive)` → PR 4):
 *
 *   - **Node runtime + raw body.** Standard-Webhooks signs the *raw* request
 *     body, so we read `req.text()` before any parsing and validate against it.
 *     `runtime = "nodejs"` because the SDK's verification uses Node crypto.
 *   - **Flag off ⇒ 404.** `BILLING_ENABLED=false` (every self-host install,
 *     pre-launch hosted) means this endpoint does not exist. Checked first.
 *   - **Fail closed without the secret.** With billing on but
 *     `POLAR_WEBHOOK_SECRET` unset we cannot verify, so we reject (500 ⇒ Polar
 *     retries) rather than trust an unverified body.
 *   - **Ack fast on success or duplicate.** A valid event — new or re-delivered —
 *     returns 200. Side-effect failures also ack 200 (the event is durably
 *     stored; PR 6 reconcile retries); only an unverifiable signature is 403.
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  // Flag off: the route does not exist. Short-circuit before reading secrets,
  // the body, or constructing anything — upholds the self-host invariant.
  if (!features.billingEnabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) {
    console.error(
      "[billing] BILLING_ENABLED is on but POLAR_WEBHOOK_SECRET is unset — " +
        "rejecting webhook (fail closed). Set the secret in deploy secrets.",
    );
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Raw body first — the signature covers these exact bytes.
  const body = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let event: WebhookEvent;
  try {
    event = validateEvent(body, headers, secret) as unknown as WebhookEvent;
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      // Invalid or missing signature ⇒ reject. Do not record or process.
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
    throw err;
  }

  // Standard-Webhooks always carries a stable per-message id; it's our
  // idempotency key. Absence means a malformed delivery we can't dedupe.
  const eventId = headers["webhook-id"] ?? "";
  if (!eventId) {
    return NextResponse.json({ error: "Missing webhook id" }, { status: 400 });
  }

  // Persist the original event JSON for replay/debug — the durable record of
  // what Polar actually sent (snake_case wire shape). Fall back to the raw
  // string if it somehow isn't JSON. The PR 6 reconcile retry normalises this
  // back into a validated-shaped event before replaying it.
  let rawPayload: unknown = body;
  try {
    rawPayload = JSON.parse(body);
  } catch {
    /* keep the raw string */
  }

  // Record + apply. Duplicates and side-effect failures both ack 200: the event
  // is durably stored and PR 6 reconcile retries anything left unprocessed. We
  // apply the already-validated `event` live, but store `rawPayload` for replay.
  await processWebhookEvent(event, eventId, { rawPayload });

  return NextResponse.json({ received: true });
}
