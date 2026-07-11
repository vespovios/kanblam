import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** POST /api/cron/cleanup-demo-workspaces — reap demo tenants older than
 *  DEMO_TTL_HOURS (default 24). Same auth pattern as the other crons:
 *  `Authorization: Bearer $CRON_SECRET`. Workspace deletion cascades to
 *  users, projects, tasks, tags, templates — one deleteMany is the whole
 *  cleanup. Guarded by DEMO_MODE so a mis-wired prod crontab entry is a
 *  no-op rather than a data-loss hazard (prod has no isDemo rows anyway —
 *  defense in depth).
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.DEMO_MODE !== "1") {
    return NextResponse.json({ deleted: 0, skipped: "not a DEMO_MODE deployment" });
  }

  const ttlHours = Number(process.env.DEMO_TTL_HOURS) || 24;
  const cutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000);

  const { count } = await prisma.workspace.deleteMany({
    where: { isDemo: true, createdAt: { lt: cutoff } },
  });
  return NextResponse.json({ deleted: count, ttlHours });
}
