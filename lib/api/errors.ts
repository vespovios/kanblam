import { NextResponse } from "next/server";

/**
 * Public API (/api/v1) error envelope. Every non-2xx response is
 * `{ "error": { "code": "...", "message": "..." } }` with a code from the
 * fixed list below — codes are part of the public contract (documented in
 * the OpenAPI spec), messages are human-readable and may change.
 */

export const API_ERROR_CODES = [
  "unauthorized", // 401 — missing/malformed/unknown/revoked/expired token
  "forbidden", // 403 — valid token, insufficient scope
  "not_found", // 404 — unknown id (cross-workspace ids look identical)
  "invalid_request", // 422 — body/query failed validation
  "rate_limited", // 429 — per-token limit exceeded
  "internal", // 500
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

const STATUS_FOR: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_request: 422,
  rate_limited: 429,
  internal: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  /** Extra response headers (e.g. Retry-After on 429). */
  readonly headers?: Record<string, string>;
  /** Optional structured details (e.g. zod field errors on 422). */
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, opts?: { headers?: Record<string, string>; details?: unknown }) {
    super(message);
    this.code = code;
    this.status = STATUS_FOR[code];
    this.headers = opts?.headers;
    this.details = opts?.details;
  }
}

export function apiErrorResponse(err: ApiError): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined && { details: err.details }),
      },
    },
    { status: err.status, headers: err.headers },
  );
}
