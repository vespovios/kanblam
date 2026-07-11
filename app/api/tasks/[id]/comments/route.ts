import { NextResponse } from "next/server";
import { requireWorkspaceContext, requireWritableWorkspace, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { createCommentSchema } from "@/lib/validators/comment";
import { listComments, createComment } from "@/lib/comments/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

interface Ctx {
  params: Promise<{ id: string }>;
}

/** Internal (session) comment routes backing the task drawer. `isOwn` and
 *  `canDelete` are computed server-side so the client needs no user prop. */

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const ctx = await requireWorkspaceContext();
    const { id } = await params;
    const comments = await listComments(ctx.workspaceId, id);
    if (comments === null) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    const isAdmin = ctx.role === "ADMIN";
    return NextResponse.json({
      comments: comments.map((c) => ({
        id: c.id,
        body: c.body,
        author: c.author,
        createdAt: c.createdAt.toISOString(),
        canDelete: isAdmin || c.author?.id === ctx.userId,
      })),
    });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const ctx = await requireWritableWorkspace();
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = createCommentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const comment = await createComment(ctx.workspaceId, id, ctx.userId, parsed.data);
    if (!comment) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    await notifyWorkspace(ctx.workspaceId, "tasks");
    return NextResponse.json(
      {
        comment: {
          id: comment.id,
          body: comment.body,
          author: comment.author,
          createdAt: comment.createdAt.toISOString(),
          canDelete: true,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
