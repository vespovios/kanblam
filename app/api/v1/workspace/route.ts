import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/api/handler";

/** GET /api/v1/workspace — the token's workspace. */
export const GET = apiHandler("read", async (_req, ctx) => {
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { id: ctx.workspaceId },
    select: { id: true, name: true, workingDays: true, createdAt: true },
  });
  return NextResponse.json({ workspace: ws });
});
