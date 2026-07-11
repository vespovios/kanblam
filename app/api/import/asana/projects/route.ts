import { NextResponse } from "next/server";
import { requireWorkspaceContext, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { asanaProjectsSchema } from "@/lib/validators/import";
import { fetchAsanaProjects, AsanaError } from "@/lib/import/asana";

/** Validate the supplied Asana token and list the user's Asana projects.
 *  The token is read from the body, used once, and never stored. */
export async function POST(req: Request) {
  try {
    await requireWorkspaceContext();
    const body = await req.json().catch(() => null);
    const parsed = asanaProjectsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const projects = await fetchAsanaProjects(parsed.data.token);
    return NextResponse.json({ projects });
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
