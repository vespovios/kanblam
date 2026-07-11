import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateInstancesForWorkspace } from "@/lib/recurring/service";

const LOOKAHEAD_DAYS = 30;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaces = await prisma.workspace.findMany({ select: { id: true } });
  const now = new Date();
  let total = 0;
  const failures: Array<{ workspaceId: string; error: string }> = [];
  for (const ws of workspaces) {
    try {
      total += await generateInstancesForWorkspace(ws.id, now, LOOKAHEAD_DAYS);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("generateInstancesForWorkspace failed", { workspaceId: ws.id, error: msg });
      failures.push({ workspaceId: ws.id, error: msg });
    }
  }
  return NextResponse.json({
    workspacesProcessed: workspaces.length,
    instancesCreated: total,
    failures,
    timestamp: now.toISOString(),
  });
}
