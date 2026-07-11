import { NextResponse } from "next/server";
import { requireWritableWorkspace, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { asanaImportSchema } from "@/lib/validators/import";
import {
  fetchAsanaProjectData,
  buildImportPlan,
  executeImport,
  AsanaError,
} from "@/lib/import/asana";
import { notifyWorkspace } from "@/lib/realtime/notify";

/** Run the import. Re-pulls from Asana (rather than trusting client-submitted
 *  task data) and creates everything in one transaction. */
export async function POST(req: Request) {
  try {
    const ctx = await requireWritableWorkspace();
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
    const result = await executeImport(ctx.workspaceId, plan);

    await notifyWorkspace(ctx.workspaceId, "projects");
    await notifyWorkspace(ctx.workspaceId, "tasks");

    return NextResponse.json({ result });
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
