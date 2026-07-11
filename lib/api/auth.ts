import { verifyApiToken } from "@/lib/api-tokens/service";
import type { ApiTokenScope } from "@/lib/validators/api-token";
import { ApiError } from "./errors";
import { checkRateLimit } from "./rate-limit";

/**
 * Bearer-token authentication for the public API. /api/v1 deliberately does
 * NOT accept session cookies — keeping the browser session out of the
 * public surface means zero CSRF exposure there.
 *
 * A verified token acts as its user: downstream code receives the same
 * (userId, workspaceId, role) triple a session request would produce, so
 * the service layer needs no changes.
 */

export interface ApiContext {
  tokenId: string;
  scopes: string[];
  userId: string;
  workspaceId: string;
  role: "ADMIN" | "MEMBER";
}

export async function requireApiContext(
  req: Request,
  scope: ApiTokenScope,
): Promise<ApiContext> {
  const header = req.headers.get("authorization") ?? "";
  const [kind, raw, ...rest] = header.split(" ");
  if (kind?.toLowerCase() !== "bearer" || !raw || rest.length > 0) {
    throw new ApiError("unauthorized", "Provide an API token: Authorization: Bearer kb_…");
  }

  const verified = await verifyApiToken(raw);
  if (!verified) {
    throw new ApiError("unauthorized", "Unknown, revoked, or expired API token.");
  }

  const rate = checkRateLimit(verified.tokenId);
  if (!rate.allowed) {
    throw new ApiError("rate_limited", "Rate limit exceeded — slow down.", {
      headers: { "Retry-After": String(rate.retryAfterSec) },
    });
  }

  if (!verified.scopes.includes(scope)) {
    throw new ApiError(
      "forbidden",
      `This token lacks the "${scope}" scope.`,
    );
  }

  return {
    tokenId: verified.tokenId,
    scopes: verified.scopes,
    userId: verified.user.id,
    workspaceId: verified.user.workspaceId,
    role: verified.user.role,
  };
}
