import type { Metadata } from "next";
import Link from "next/link";
import { buildOpenApiDocument } from "@/lib/api/openapi";

/** /docs/api — the API reference, rendered server-side straight from the
 *  same OpenAPI document that scripts/generate-openapi.ts writes to
 *  public/openapi.json. Hand-rolled (no Scalar/Redoc bundle): zero new
 *  dependencies, CSP-safe (script-src 'self'), and it matches the docs
 *  site's look. */

export const metadata: Metadata = { title: "API reference · KanBlam docs" };

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const METHOD_STYLE: Record<string, string> = {
  get: "bg-sky-100 text-sky-800",
  post: "bg-green-100 text-green-800",
  patch: "bg-amber-100 text-amber-800",
  delete: "bg-red-100 text-red-800",
};

function schemaType(prop: Obj): string {
  if (prop.enum) return prop.enum.map((v: unknown) => JSON.stringify(v)).join(" | ");
  let t = Array.isArray(prop.type) ? prop.type.join(" | ") : (prop.type ?? "any");
  if (t === "array" && prop.items) t = `${schemaType(prop.items)}[]`;
  const bounds: string[] = [];
  if (prop.minLength !== undefined) bounds.push(`min ${prop.minLength}`);
  if (prop.maxLength !== undefined) bounds.push(`max ${prop.maxLength}`);
  if (prop.minimum !== undefined) bounds.push(`≥ ${prop.minimum}`);
  if (prop.maximum !== undefined) bounds.push(`≤ ${prop.maximum}`);
  if (prop.default !== undefined) bounds.push(`default ${JSON.stringify(prop.default)}`);
  return bounds.length ? `${t} (${bounds.join(", ")})` : t;
}

function PropsTable({ schema }: { schema: Obj }) {
  const props = Object.entries((schema.properties ?? {}) as Record<string, Obj>);
  if (props.length === 0) return null;
  const required: string[] = schema.required ?? [];
  return (
    <table>
      <thead>
        <tr><th>Field</th><th>Type</th><th>Required</th></tr>
      </thead>
      <tbody>
        {props.map(([name, prop]) => (
          <tr key={name}>
            <td><code>{name}</code></td>
            <td>{schemaType(prop)}</td>
            <td>{required.includes(name) ? "✓" : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ApiReferencePage() {
  const doc = buildOpenApiDocument() as Obj;
  const tags: string[] = (doc.tags as Obj[]).map((t) => t.name);

  // Flatten paths → operations, grouped by tag in declared tag order.
  const opsByTag = new Map<string, { method: string; path: string; op: Obj }[]>();
  for (const [path, methods] of Object.entries(doc.paths as Record<string, Obj>)) {
    for (const [method, op] of Object.entries(methods as Record<string, Obj>)) {
      const tag = (op.tags?.[0] as string) ?? "Other";
      if (!opsByTag.has(tag)) opsByTag.set(tag, []);
      opsByTag.get(tag)!.push({ method, path, op });
    }
  }

  return (
    <div>
      <h1>API reference</h1>
      <p>
        {doc.info.description} New to the API? Start with the{" "}
        <Link href="/docs/api-quickstart">quickstart</Link>. Machine-readable
        spec: <a href="/openapi.json">openapi.json</a> (OpenAPI 3.1).
      </p>
      <p>
        Errors always look like{" "}
        <code>{`{"error":{"code":"not_found","message":"…"}}`}</code> with a
        code from: <code>unauthorized</code>, <code>forbidden</code>,{" "}
        <code>not_found</code>, <code>invalid_request</code>,{" "}
        <code>rate_limited</code>, <code>internal</code>.
      </p>

      {tags.map((tag) => (
        <section key={tag}>
          <h2>{tag}</h2>
          {(opsByTag.get(tag) ?? []).map(({ method, path, op }) => {
            const body = op.requestBody?.content?.["application/json"]?.schema as Obj | undefined;
            const params = (op.parameters ?? []) as Obj[];
            const queryPs = params.filter((p) => p.in === "query");
            const okResponse = Object.entries(op.responses as Record<string, Obj>).find(([s]) =>
              s.startsWith("2"),
            );
            const example = okResponse?.[1]?.content?.["application/json"]?.example;
            return (
              <div key={method + path} className="mb-8 rounded-xl border border-border p-4 [&>table]:my-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 font-mono text-xs font-bold uppercase ${METHOD_STYLE[method]}`}
                  >
                    {method}
                  </span>
                  <code className="text-sm font-semibold">/api/v1{path}</code>
                  <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                    scope: {op["x-required-scope"]}
                  </span>
                </div>
                <p className="mb-1 mt-2 font-medium">{op.summary}</p>
                {op.description && (
                  <p className="mt-0 text-sm text-muted-foreground">{op.description}</p>
                )}
                {queryPs.length > 0 && (
                  <>
                    <p className="mb-0 mt-3 text-sm font-semibold">Query parameters</p>
                    <table>
                      <thead>
                        <tr><th>Param</th><th>Type</th><th>Required</th></tr>
                      </thead>
                      <tbody>
                        {queryPs.map((p) => (
                          <tr key={p.name as string}>
                            <td><code>{p.name}</code></td>
                            <td>{schemaType(p.schema as Obj)}</td>
                            <td>{p.required ? "✓" : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
                {body && (
                  <>
                    <p className="mb-0 mt-3 text-sm font-semibold">Request body</p>
                    <PropsTable schema={body} />
                  </>
                )}
                {example !== undefined && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold">
                      Example response ({okResponse![0]})
                    </summary>
                    <pre className="mt-2 text-xs">{JSON.stringify(example, null, 2)}</pre>
                  </details>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
