import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { serializeTag } from "@/lib/api/serialize";
import { updateTagSchema } from "@/lib/validators/tag";
import { updateTag, deleteTag } from "@/lib/tags/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

/** PATCH /api/v1/tags/[id] — rename and/or recolour. */
export const PATCH = apiHandler("write", async (req, ctx, extra) => {
  const { id } = await extra.params;
  const body = await req.json().catch(() => null);
  const input = updateTagSchema.parse(body ?? {});
  let tag;
  try {
    tag = await updateTag(ctx.workspaceId, id, input);
  } catch (err) {
    // CI name collision throws
    const message = err instanceof Error ? err.message : "Failed to update tag";
    throw new ApiError("invalid_request", message);
  }
  if (!tag) throw new ApiError("not_found", "Tag not found.");
  await notifyWorkspace(ctx.workspaceId, "tags");
  return NextResponse.json({ tag: serializeTag({ ...tag, _count: undefined }) });
});

/** DELETE /api/v1/tags/[id] — removes the tag from every task (the tasks
 *  themselves are untouched). */
export const DELETE = apiHandler("write", async (_req, ctx, extra) => {
  const { id } = await extra.params;
  const deleted = await deleteTag(ctx.workspaceId, id);
  if (!deleted) throw new ApiError("not_found", "Tag not found.");
  await notifyWorkspace(ctx.workspaceId, "tags");
  return NextResponse.json({ ok: true });
});
