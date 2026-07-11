import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/api/handler";

/** GET /api/v1/stages — the workspace's kanban stages, board order. */
export const GET = apiHandler("read", async (_req, ctx) => {
  const stages = await prisma.kanbanStage.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { order: "asc" },
    select: { id: true, name: true, color: true, order: true, isTerminal: true },
  });
  return NextResponse.json({ stages });
});
