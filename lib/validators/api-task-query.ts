import { z } from "zod";
import { QUADRANT_IDS, type QuadrantId } from "@/lib/eisenhower/quadrants";

/** Query parameters for GET /api/v1/tasks. Lives in validators/ (not the
 *  route file) so the OpenAPI builder can document it — Next route modules
 *  may only export handlers. */
export const listTasksQuerySchema = z.object({
  projectId: z.string().optional(),
  assigneeId: z.string().optional(),
  stageId: z.string().optional(),
  quadrant: z.enum(QUADRANT_IDS as readonly [QuadrantId, ...QuadrantId[]]).optional(),
  /** Comma-separated tag ids — tasks matching ANY of them. */
  tags: z.string().optional(),
  q: z.string().optional(),
  /** Default: everything, including terminal-stage tasks — the API never
   *  silently hides data. Pass hideCompleted=true to trim. */
  hideCompleted: z.enum(["true", "false"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
