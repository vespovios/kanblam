import { randomBytes, createHash } from "crypto";

/** Generate a cryptographically random 32-byte token, hex-encoded (64 chars). */
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/** SHA-256 hash of a token, hex-encoded. Used to store non-reversible reference. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
