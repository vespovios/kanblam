import { prisma } from "@/lib/db";
import type { CreateCommentInput } from "@/lib/validators/comment";

/** Task comments: plain text, chronological, no threads/edits (v1).
 *  Deletion: authors delete their own; ADMINs may moderate anything.
 *  Deleted users leave their comments behind with a null author. */

const COMMENT_INCLUDE = {
  author: { select: { id: true, name: true } },
} as const;

async function taskInWorkspace(workspaceId: string, taskId: string): Promise<boolean> {
  const c = await prisma.task.count({ where: { id: taskId, workspaceId } });
  return c > 0;
}

export async function listComments(workspaceId: string, taskId: string) {
  if (!(await taskInWorkspace(workspaceId, taskId))) return null;
  return prisma.comment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
    include: COMMENT_INCLUDE,
  });
}

export async function createComment(
  workspaceId: string,
  taskId: string,
  authorId: string,
  input: CreateCommentInput,
) {
  if (!(await taskInWorkspace(workspaceId, taskId))) return null;
  return prisma.comment.create({
    data: { workspaceId, taskId, authorId, body: input.body },
    include: COMMENT_INCLUDE,
  });
}

/** Delete a comment. Authors delete their own; ADMIN deletes any.
 *  Returns false for unknown ids, foreign-workspace ids, and
 *  not-yours-and-you're-not-admin — all indistinguishable. */
export async function deleteComment(
  workspaceId: string,
  commentId: string,
  requester: { userId: string; role: "ADMIN" | "MEMBER" },
): Promise<boolean> {
  const { count } = await prisma.comment.deleteMany({
    where: {
      id: commentId,
      workspaceId,
      ...(requester.role !== "ADMIN" && { authorId: requester.userId }),
    },
  });
  return count > 0;
}
