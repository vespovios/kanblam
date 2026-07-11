import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { provisionDemoWorkspace } from "@/lib/demo/provision";

/** POST /api/demo — create a throwaway, pre-seeded demo tenant and hand the
 *  visitor its credentials for an immediate client-side sign-in.
 *
 *  Only exists on DEMO_MODE deployments (try.kanblam.com). On prod / normal
 *  self-hosts the route 404s, so it adds no attack surface there.
 *
 *  Abuse posture (single-box, no external deps):
 *  - per-IP limit: 3 demos/hour (in-memory sliding window — resets on
 *    container restart, which is fine for a demo box)
 *  - global caps: 30 demos/hour, 500 live demo workspaces
 *  - nightly TTL reaping via /api/cron/cleanup-demo-workspaces
 */

const PER_IP_PER_HOUR = 3;
const GLOBAL_PER_HOUR = 30;
const MAX_LIVE_DEMOS = 500;
const HOUR_MS = 60 * 60 * 1000;

const ipHits = new Map<string, number[]>();
let globalHits: number[] = [];

function allow(ip: string): boolean {
  const now = Date.now();
  globalHits = globalHits.filter((t) => now - t < HOUR_MS);
  if (globalHits.length >= GLOBAL_PER_HOUR) return false;

  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < HOUR_MS);
  if (hits.length >= PER_IP_PER_HOUR) return false;

  hits.push(now);
  ipHits.set(ip, hits);
  globalHits.push(now);
  // Opportunistic cleanup so the map can't grow unbounded.
  if (ipHits.size > 5000) {
    for (const [k, v] of ipHits) {
      if (v.every((t) => now - t >= HOUR_MS)) ipHits.delete(k);
    }
  }
  return true;
}

export async function POST(req: Request) {
  if (process.env.DEMO_MODE !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown";
  if (!allow(ip)) {
    return NextResponse.json(
      { error: "Demo limit reached — try again in a little while." },
      { status: 429 },
    );
  }

  const liveDemos = await prisma.workspace.count({ where: { isDemo: true } });
  if (liveDemos >= MAX_LIVE_DEMOS) {
    return NextResponse.json(
      { error: "The demo server is full right now — try again later." },
      { status: 503 },
    );
  }

  try {
    const creds = await provisionDemoWorkspace();
    return NextResponse.json(
      {
        email: creds.email,
        password: creds.password,
        displayName: creds.displayName,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("demo provisioning failed", err);
    return NextResponse.json(
      { error: "Something went wrong spinning up your demo. Please try again." },
      { status: 500 },
    );
  }
}
