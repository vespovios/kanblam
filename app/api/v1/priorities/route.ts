import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/api/handler";

/** GET /api/v1/priorities — the workspace's priorities, highest first. */
export const GET = apiHandler("read", async (_req, ctx) => {
  const priorities = await prisma.priority.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { order: "asc" },
    select: { id: true, name: true, color: true, order: true },
  });
  return NextResponse.json({ priorities });
});
