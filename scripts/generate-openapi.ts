/**
 * Write the OpenAPI document to public/openapi.json.
 *
 *   npx tsx scripts/generate-openapi.ts
 *
 * CI regenerates and fails on diff (see .github/workflows/ci.yml), so the
 * committed spec can never drift from the zod validators the routes
 * actually parse with. Run this after any /api/v1 change and commit the
 * result.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { buildOpenApiDocument } from "../lib/api/openapi";

const doc = buildOpenApiDocument();
const out = path.join(__dirname, "..", "public", "openapi.json");
writeFileSync(out, JSON.stringify(doc, null, 2) + "\n");
console.log(`✔ wrote ${out}`);
