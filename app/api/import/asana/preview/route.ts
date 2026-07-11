import { NextResponse } from "next/server";
import { requireWorkspaceContext, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { asanaImportSchema } from "@/lib/validators/import";
import {
  fetchAsanaProjectData,
  buildImportPlan,
  findProjectNameClashes,
  AsanaError,
} from "@/lib/import/asana";

/** Compute the import plan for the chosen Asana project + mapping mode.
 *  Read-only — writes nothing. Surfaces project-name clashes as a warning. */
export async function POST(req: Request) {
  try {
    const ctx = await requireWorkspaceContext();
    const body = await req.json().catch(() => null);
    const parsed = asanaImportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { token, projectGid, mode } = parsed.data;
    const data = await fetchAsanaProjectData(token, projectGid);
    const plan = buildImportPlan(data, mode);
    const clashes = await findProjectNameClashes(ctx.workspaceId, plan);

    return NextResponse.json({
      preview: {
        sourceProject: data.projectName,
        mode: plan.mode,
        projects: plan.projects.map((p) => ({
          name: p.name,
          taskCount: p.tasks.length,
          completedCount: p.tasks.filter((t) => t.completed).length,
        })),
        tags: plan.tags,
        totalTasks: plan.totalTasks,
        totalSubtasks: plan.totalSubtasks,
        clashes,
      },
    });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof AsanaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
