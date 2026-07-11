import { NextResponse } from "next/server";
import { requireWorkspaceContext, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { createApiTokenSchema } from "@/lib/validators/api-token";
import { createApiToken, listApiTokens } from "@/lib/api-tokens/service";

/** Settings → API tokens. Session-authenticated (this is the management
 *  surface, not the API itself). Tokens are per-user: every member manages
 *  their own, admins get no special view of others' tokens. */

export async function GET() {
  try {
    const ctx = await requireWorkspaceContext();
    const tokens = await listApiTokens(ctx.userId);
    return NextResponse.json({ tokens });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireWorkspaceContext();
    const body = await req.json().catch(() => null);
    const parsed = createApiTokenSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    try {
      const { token, record } = await createApiToken(ctx.userId, parsed.data);
      return NextResponse.json({ token, record }, { status: 201 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create token";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
