import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { serializeComment } from "@/lib/api/serialize";
import { createCommentSchema } from "@/lib/validators/comment";
import { listComments, createComment } from "@/lib/comments/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

/** GET /api/v1/tasks/[id]/comments — chronological. */
export const GET = apiHandler("read", async (_req, ctx, extra) => {
  const { id } = await extra.params;
  const comments = await listComments(ctx.workspaceId, id);
  if (comments === null) throw new ApiError("not_found", "Task not found.");
  return NextResponse.json({ comments: comments.map(serializeComment) });
});

/** POST /api/v1/tasks/[id]/comments — how an agent (or any API client)
 *  reports progress in prose: "blocked on X", "done, see PR #12". */
export const POST = apiHandler("write", async (req, ctx, extra) => {
  const { id } = await extra.params;
  const body = await req.json().catch(() => null);
  const input = createCommentSchema.parse(body ?? {});
  const comment = await createComment(ctx.workspaceId, id, ctx.userId, input);
  if (!comment) throw new ApiError("not_found", "Task not found.");
  await notifyWorkspace(ctx.workspaceId, "tasks");
  return NextResponse.json({ comment: serializeComment(comment) }, { status: 201 });
});
