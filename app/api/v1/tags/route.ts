import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { serializeTag } from "@/lib/api/serialize";
import { createTagSchema } from "@/lib/validators/tag";
import { listTags, createTag } from "@/lib/tags/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

/** GET /api/v1/tags — all tags with task counts. */
export const GET = apiHandler("read", async (_req, ctx) => {
  const tags = await listTags(ctx.workspaceId);
  return NextResponse.json({ tags: tags.map(serializeTag) });
});

/** POST /api/v1/tags — create (colour auto-assigned, editable via PATCH). */
export const POST = apiHandler("write", async (req, ctx) => {
  const body = await req.json().catch(() => null);
  const input = createTagSchema.parse(body ?? {});
  try {
    const tag = await createTag(ctx.workspaceId, input);
    await notifyWorkspace(ctx.workspaceId, "tags");
    return NextResponse.json(
      { tag: serializeTag({ ...tag, _count: { tasks: 0 } }) },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create tag";
    throw new ApiError("invalid_request", message);
  }
});
