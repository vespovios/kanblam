import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { deleteComment } from "@/lib/comments/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

/** DELETE /api/v1/comments/[id] — the token's user deletes their own
 *  comments; ADMIN-role tokens may moderate any. */
export const DELETE = apiHandler("write", async (_req, ctx, extra) => {
  const { id } = await extra.params;
  const deleted = await deleteComment(ctx.workspaceId, id, {
    userId: ctx.userId,
    role: ctx.role,
  });
  if (!deleted) throw new ApiError("not_found", "Comment not found.");
  await notifyWorkspace(ctx.workspaceId, "tasks");
  return NextResponse.json({ ok: true });
});
