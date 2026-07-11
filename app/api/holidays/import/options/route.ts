import { NextResponse } from "next/server";
import { requireAdminContext, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { listCountries, listSubdivisions } from "@/lib/holidays/catalog";

export async function GET(req: Request) {
  try {
    await requireAdminContext();
    const country = new URL(req.url).searchParams.get("country");
    const countries = listCountries();
    const subdivisions = country ? listSubdivisions(country.toUpperCase()) : [];
    return NextResponse.json({ countries, subdivisions });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
