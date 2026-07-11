import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { ApiTokenScope } from "@/lib/validators/api-token";
import { requireApiContext, type ApiContext } from "./auth";
import { ApiError, apiErrorResponse } from "./errors";

/**
 * Route-handler wrapper for /api/v1: authenticates (Bearer + scope + rate
 * limit), then maps every failure mode onto the public error envelope.
 * Endpoints stay tiny:
 *
 *   export const GET = apiHandler("read", async (req, ctx) => {
 *     return NextResponse.json({ ... });
 *   });
 *
 * Dynamic segments arrive as the third argument, matching Next's route
 * context shape (`{ params: Promise<...> }`).
 */

type RouteExtra = { params: Promise<Record<string, string>> };

export function apiHandler(
  scope: ApiTokenScope,
  fn: (req: Request, ctx: ApiContext, extra: RouteExtra) => Promise<NextResponse>,
) {
  return async (req: Request, extra: RouteExtra): Promise<NextResponse> => {
    try {
      const ctx = await requireApiContext(req, scope);
      return await fn(req, ctx, extra);
    } catch (err) {
      if (err instanceof ApiError) return apiErrorResponse(err);
      if (err instanceof ZodError) {
        return apiErrorResponse(
          new ApiError("invalid_request", "Request failed validation.", {
            details: err.flatten(),
          }),
        );
      }
      console.error("[api/v1] unhandled error", err);
      return apiErrorResponse(new ApiError("internal", "Something went wrong."));
    }
  };
}
