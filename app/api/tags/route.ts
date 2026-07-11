import { NextResponse } from "next/server";
import { requireWorkspaceContext, requireWritableWorkspace, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { createTagSchema } from "@/lib/validators/tag";
import { listTags, createTag } from "@/lib/tags/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

export async function GET() {
  try {
    const ctx = await requireWorkspaceContext();
    const tags = await listTags(ctx.workspaceId);
    return NextResponse.json({ tags });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireWritableWorkspace();
    const body = await req.json().catch(() => null);
    const parsed = createTagSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    try {
      const tag = await createTag(ctx.workspaceId, parsed.data);
      await notifyWorkspace(ctx.workspaceId, "tags");
      return NextResponse.json({ tag }, { status: 201 });
    } catch (err) {
      if (err instanceof Error && /already exists/i.test(err.message)) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
