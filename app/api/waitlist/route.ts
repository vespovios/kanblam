import { NextResponse } from "next/server";
import { z } from "zod";
import { sendMail } from "@/lib/email/send";
import { features } from "@/lib/config/features";

/** Public, unauthenticated. Anyone can drop their email to be notified
 *  when KanBlam launches publicly. The route just forwards the address to
 *  the operator as an email; no DB persistence — the list lives in
 *  the operator's inbox until a real signup funnel ships.
 *
 *  Gated by the WAITLIST_ENABLED feature flag — self-host deploys turn
 *  this off and the route returns 404 (looks like the endpoint doesn't
 *  exist at all). */

const waitlistSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase().trim()),
});

/** Operator inbox — every signup is forwarded here. Defaults to the seed
 *  admin so a fresh deploy still routes mail somewhere sensible. */
const OPERATOR_EMAIL =
  process.env.WAITLIST_NOTIFY_TO ?? process.env.ADMIN_EMAIL ?? "";

export async function POST(req: Request) {
  if (!features.waitlistEnabled) {
    // Self-host deploys: route is off. 404 so it looks like the endpoint
    // doesn't exist at all (rather than 503 or a feature-flag error which
    // would tell probers that the SaaS code paths exist).
    return new NextResponse("Not Found", { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = waitlistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  const { email } = parsed.data;

  if (!OPERATOR_EMAIL) {
    // Configuration bug — log and tell the user something soft. We still
    // pretend success so a misconfigured deploy doesn't leak operational
    // info to the public form.
    console.error("[waitlist] no WAITLIST_NOTIFY_TO / ADMIN_EMAIL set; signup dropped:", email);
    return NextResponse.json({ ok: true });
  }

  try {
    await sendMail({
      to: OPERATOR_EMAIL,
      subject: `New KanBlam waitlist signup: ${email}`,
      text: `Someone joined the waitlist.\n\nEmail: ${email}\nWhen: ${new Date().toISOString()}\n`,
      html: `<p>Someone joined the KanBlam waitlist.</p>
             <p><strong>Email:</strong> ${email}<br>
                <strong>When:</strong> ${new Date().toISOString()}</p>`,
    });
  } catch (err) {
    console.error("[waitlist] sendMail failed:", err);
    // Soft-fail to the visitor — their address didn't reach us but
    // surfacing that risks them spamming the form. Surface to logs only.
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
