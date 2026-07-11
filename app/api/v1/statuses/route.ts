import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/api/handler";

/** GET /api/v1/statuses — project statuses, configured order. */
export const GET = apiHandler("read", async (_req, ctx) => {
  const statuses = await prisma.status.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { order: "asc" },
    select: { id: true, name: true, color: true, order: true },
  });
  return NextResponse.json({ statuses });
});
