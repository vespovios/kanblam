import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/api/handler";

/** GET /api/v1/members — workspace members for assignee pickers.
 *  Deliberately id + name only: API clients don't need teammates' emails. */
export const GET = apiHandler("read", async (_req, ctx) => {
  const members = await prisma.user.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  return NextResponse.json({ members });
});
