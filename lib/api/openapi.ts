import { z, type ZodType } from "zod";
import { createTaskSchema, updateTaskSchema } from "@/lib/validators/task";
import { listTasksQuerySchema } from "@/lib/validators/api-task-query";
import { moveTaskSchema } from "@/lib/validators/task-move";
import { createSubtaskSchema, updateSubtaskSchema } from "@/lib/validators/subtask";
import { createCommentSchema } from "@/lib/validators/comment";
import { createProjectSchema, updateProjectSchema } from "@/lib/validators/project";
import { createTagSchema, updateTagSchema } from "@/lib/validators/tag";
import { API_ERROR_CODES } from "@/lib/api/errors";

/**
 * The OpenAPI 3.1 document for /api/v1, built from the SAME zod validators
 * the routes parse with — request schemas cannot drift from behaviour.
 * `scripts/generate-openapi.ts` writes it to public/openapi.json and CI
 * fails when the committed file differs from this source of truth.
 * The human-readable rendering lives at /docs/api.
 */

type Obj = Record<string, unknown>;

const json = (schema: ZodType): Obj => {
  const out = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Obj;
  delete out.$schema;
  return out;
};

/** Query-string parameters from a flat zod object schema. */
const queryParams = (schema: ZodType): Obj[] => {
  const js = json(schema) as { properties?: Record<string, Obj>; required?: string[] };
  return Object.entries(js.properties ?? {}).map(([name, prop]) => ({
    name,
    in: "query",
    required: js.required?.includes(name) ?? false,
    schema: prop,
  }));
};

const idParam = (name: string, description: string): Obj => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string" },
  description,
});

const errorResponses = (...codes: number[]): Record<string, Obj> => {
  const map: Record<number, string> = {
    401: "Missing, malformed, revoked, or expired token",
    403: "Token lacks the required scope",
    404: "Not found (cross-workspace ids are indistinguishable from unknown ids)",
    422: "Request failed validation",
    429: "Rate limit exceeded — see Retry-After",
  };
  return Object.fromEntries(
    codes.map((c) => [
      String(c),
      { description: map[c], content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
    ]),
  );
};

const ok = (description: string, example: unknown, status = 200): Record<string, Obj> => ({
  [String(status)]: {
    description,
    content: { "application/json": { example } },
  },
});

interface Op {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  tag: string;
  scope: "read" | "write";
  summary: string;
  description?: string;
  params?: Obj[];
  body?: ZodType;
  responses: Record<string, Obj>;
}

// ---- example payloads (documentation, not contract) ----
const exTask = {
  id: "cku…task", name: "Tune 2 m dipole antenna", description: null, notes: null,
  project: { id: "cku…proj", name: "Payload & Electronics", code: "PAY" },
  stage: { id: "cku…stage", name: "In Progress", isTerminal: false },
  priority: { id: "cku…prio", name: "Medium" },
  assignee: { id: "cku…user", name: "Brisk Otter" },
  isImportant: true, isUrgent: false, quadrant: "q2",
  startDate: null, dueDate: "2026-08-01", progressPct: 50, progressManual: false,
  recurring: false, tags: [{ id: "cku…tag", name: "ham-radio", color: "#8b5cf6" }],
  subtasks: [{ id: "cku…sub", title: "Trim both legs", completed: true, position: 0 }],
  createdAt: "2026-07-10T18:37:13.553Z", updatedAt: "2026-07-10T18:37:13.553Z",
};
const exSubtask = { id: "cku…sub", title: "Trim both legs", completed: false, position: 0 };
const exComment = {
  id: "cku…comment", body: "Blocked on the antenna analyser — need a decision.",
  author: { id: "cku…user", name: "Brisk Otter" }, createdAt: "2026-07-10T20:20:06.878Z",
};
const exProject = {
  id: "cku…proj", name: "Flight Ops & Launch", code: "FLT",
  status: { id: "cku…status", name: "In Progress", color: "#3b82f6" },
  clientName: null, projectLead: null, startDate: "2026-06-15", endDate: "2026-08-01",
  taskCount: 12, createdAt: "2026-06-15T09:00:00.000Z",
};
const exTag = { id: "cku…tag", name: "ham-radio", color: "#8b5cf6", taskCount: 4 };

const OPS: Op[] = [
  // ---- Workspace & reference ----
  { method: "get", path: "/workspace", tag: "Reference", scope: "read",
    summary: "The token's workspace",
    responses: { ...ok("Workspace", { workspace: { id: "cku…ws", name: "Stratos-1 Mission Control", workingDays: [1, 2, 3, 4, 5], createdAt: "2026-05-01T00:00:00.000Z" } }), ...errorResponses(401, 403, 429) } },
  { method: "get", path: "/stages", tag: "Reference", scope: "read",
    summary: "Kanban stages, board order",
    responses: { ...ok("Stages", { stages: [{ id: "cku…stage", name: "Ideas", color: "#e0e9f3", order: 1, isTerminal: false }] }), ...errorResponses(401, 403, 429) } },
  { method: "get", path: "/priorities", tag: "Reference", scope: "read",
    summary: "Priorities, highest first",
    responses: { ...ok("Priorities", { priorities: [{ id: "cku…prio", name: "High", color: "#f97316", order: 1 }] }), ...errorResponses(401, 403, 429) } },
  { method: "get", path: "/statuses", tag: "Reference", scope: "read",
    summary: "Project statuses",
    responses: { ...ok("Statuses", { statuses: [{ id: "cku…status", name: "Not Started", color: "#9ca3af", order: 1 }] }), ...errorResponses(401, 403, 429) } },
  { method: "get", path: "/members", tag: "Reference", scope: "read",
    summary: "Workspace members (id + name only)",
    description: "Members have a `kind`: `human` or `agent`. Agent members are API-only users.",
    responses: { ...ok("Members", { members: [{ id: "cku…user", name: "Brisk Otter", kind: "human" }] }), ...errorResponses(401, 403, 429) } },

  // ---- Tasks ----
  { method: "get", path: "/tasks", tag: "Tasks", scope: "read",
    summary: "List tasks (filterable, cursor-paginated)",
    description: "Stable ordering (createdAt desc). Follow `nextCursor` until it is null.",
    params: queryParams(listTasksQuerySchema),
    responses: { ...ok("A page of tasks", { tasks: [exTask], nextCursor: null }), ...errorResponses(401, 403, 422, 429) } },
  { method: "post", path: "/tasks", tag: "Tasks", scope: "write",
    summary: "Create a task",
    description: "Minimal body: `{projectId, name}`. Omitted priority → the workspace's Medium; omitted stage → first non-terminal stage; omitted assignee → the token's user.",
    body: createTaskSchema,
    responses: { ...ok("Created", { task: exTask }, 201), ...errorResponses(401, 403, 404, 422, 429) } },
  { method: "get", path: "/tasks/{id}", tag: "Tasks", scope: "read",
    summary: "Get a task", params: [idParam("id", "Task id")],
    responses: { ...ok("Task", { task: exTask }), ...errorResponses(401, 403, 404, 429) } },
  { method: "patch", path: "/tasks/{id}", tag: "Tasks", scope: "write",
    summary: "Update a task",
    description: "Partial update. For recurring instances this edits THIS occurrence only; series editing is not part of API v1. `tagIds` replaces the full tag set.",
    params: [idParam("id", "Task id")], body: updateTaskSchema,
    responses: { ...ok("Updated", { task: exTask }), ...errorResponses(401, 403, 404, 422, 429) } },
  { method: "delete", path: "/tasks/{id}", tag: "Tasks", scope: "write",
    summary: "Delete a task", params: [idParam("id", "Task id")],
    responses: { ...ok("Deleted", { ok: true }), ...errorResponses(401, 403, 404, 429) } },
  { method: "post", path: "/tasks/{id}/move", tag: "Tasks", scope: "write",
    summary: "Move a task on the board",
    description: "The board-native mutation: change stage and optionally position (`newIndex`) within the column.",
    params: [idParam("id", "Task id")], body: moveTaskSchema,
    responses: { ...ok("Moved", { task: exTask }), ...errorResponses(401, 403, 404, 422, 429) } },

  // ---- Subtasks ----
  { method: "get", path: "/tasks/{id}/subtasks", tag: "Subtasks", scope: "read",
    summary: "List a task's checklist", params: [idParam("id", "Task id")],
    responses: { ...ok("Subtasks", { subtasks: [exSubtask] }), ...errorResponses(401, 403, 404, 429) } },
  { method: "post", path: "/tasks/{id}/subtasks", tag: "Subtasks", scope: "write",
    summary: "Add a checklist item",
    description: "Parent task progress recomputes automatically (unless progress is manual).",
    params: [idParam("id", "Task id")], body: createSubtaskSchema,
    responses: { ...ok("Created", { subtask: exSubtask }, 201), ...errorResponses(401, 403, 404, 422, 429) } },
  { method: "patch", path: "/subtasks/{id}", tag: "Subtasks", scope: "write",
    summary: "Retitle / (un)complete a checklist item",
    params: [idParam("id", "Subtask id")], body: updateSubtaskSchema,
    responses: { ...ok("Updated", { subtask: { ...exSubtask, completed: true } }), ...errorResponses(401, 403, 404, 422, 429) } },
  { method: "delete", path: "/subtasks/{id}", tag: "Subtasks", scope: "write",
    summary: "Delete a checklist item", params: [idParam("id", "Subtask id")],
    responses: { ...ok("Deleted", { ok: true }), ...errorResponses(401, 403, 404, 429) } },

  // ---- Comments ----
  { method: "get", path: "/tasks/{id}/comments", tag: "Comments", scope: "read",
    summary: "List a task's comments (chronological)", params: [idParam("id", "Task id")],
    responses: { ...ok("Comments", { comments: [exComment] }), ...errorResponses(401, 403, 404, 429) } },
  { method: "post", path: "/tasks/{id}/comments", tag: "Comments", scope: "write",
    summary: "Comment on a task",
    description: "Plain text, max 10,000 chars. This is how an agent reports progress in prose.",
    params: [idParam("id", "Task id")], body: createCommentSchema,
    responses: { ...ok("Created", { comment: exComment }, 201), ...errorResponses(401, 403, 404, 422, 429) } },
  { method: "delete", path: "/comments/{id}", tag: "Comments", scope: "write",
    summary: "Delete a comment",
    description: "The token's user deletes their own comments; ADMIN-role tokens may delete any.",
    params: [idParam("id", "Comment id")],
    responses: { ...ok("Deleted", { ok: true }), ...errorResponses(401, 403, 404, 429) } },

  // ---- Projects ----
  { method: "get", path: "/projects", tag: "Projects", scope: "read",
    summary: "List projects (with task counts)",
    responses: { ...ok("Projects", { projects: [exProject] }), ...errorResponses(401, 403, 429) } },
  { method: "post", path: "/projects", tag: "Projects", scope: "write",
    summary: "Create a project",
    description: "Minimal body: `{name, code}`. Omitted statusId → the workspace's first status. Codes are unique per workspace.",
    body: createProjectSchema,
    responses: { ...ok("Created", { project: exProject }, 201), ...errorResponses(401, 403, 404, 422, 429) } },
  { method: "get", path: "/projects/{id}", tag: "Projects", scope: "read",
    summary: "Get a project", params: [idParam("id", "Project id")],
    responses: { ...ok("Project", { project: exProject }), ...errorResponses(401, 403, 404, 429) } },
  { method: "patch", path: "/projects/{id}", tag: "Projects", scope: "write",
    summary: "Update a project", params: [idParam("id", "Project id")], body: updateProjectSchema,
    responses: { ...ok("Updated", { project: exProject }), ...errorResponses(401, 403, 404, 422, 429) } },
  { method: "delete", path: "/projects/{id}", tag: "Projects", scope: "write",
    summary: "Delete a project (cascades its tasks)", params: [idParam("id", "Project id")],
    responses: { ...ok("Deleted", { ok: true }), ...errorResponses(401, 403, 404, 429) } },

  // ---- Tags ----
  { method: "get", path: "/tags", tag: "Tags", scope: "read",
    summary: "List tags (with task counts)",
    responses: { ...ok("Tags", { tags: [exTag] }), ...errorResponses(401, 403, 429) } },
  { method: "post", path: "/tags", tag: "Tags", scope: "write",
    summary: "Create a tag (colour auto-assigned)", body: createTagSchema,
    responses: { ...ok("Created", { tag: { ...exTag, taskCount: 0 } }, 201), ...errorResponses(401, 403, 422, 429) } },
  { method: "patch", path: "/tags/{id}", tag: "Tags", scope: "write",
    summary: "Rename / recolour a tag", params: [idParam("id", "Tag id")], body: updateTagSchema,
    responses: { ...ok("Updated", { tag: exTag }), ...errorResponses(401, 403, 404, 422, 429) } },
  { method: "delete", path: "/tags/{id}", tag: "Tags", scope: "write",
    summary: "Delete a tag (detaches from tasks; tasks untouched)", params: [idParam("id", "Tag id")],
    responses: { ...ok("Deleted", { ok: true }), ...errorResponses(401, 403, 404, 429) } },
];

export function buildOpenApiDocument(): Obj {
  const paths: Record<string, Obj> = {};
  for (const op of OPS) {
    const entry: Obj = {
      tags: [op.tag],
      summary: op.summary,
      ...(op.description && { description: op.description }),
      "x-required-scope": op.scope,
      ...(op.params?.length && { parameters: op.params }),
      ...(op.body && {
        requestBody: {
          required: true,
          content: { "application/json": { schema: json(op.body) } },
        },
      }),
      responses: op.responses,
      security: [{ bearerToken: [] }],
    };
    paths[op.path] = { ...(paths[op.path] as Obj | undefined), [op.method]: entry };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "KanBlam API",
      version: "1.0",
      description:
        "Token-authenticated REST API over your KanBlam workspace. Create a personal access token in Settings → API tokens and send it as `Authorization: Bearer kb_…`. A token acts as its user, limited by its scopes (`read`, `write`). Rate limit: 120 requests/minute per token.",
    },
    servers: [{ url: "/api/v1" }],
    tags: ["Reference", "Tasks", "Subtasks", "Comments", "Projects", "Tags"].map((name) => ({ name })),
    components: {
      securitySchemes: {
        bearerToken: {
          type: "http",
          scheme: "bearer",
          description: "Personal access token from Settings → API tokens (kb_…).",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string", enum: [...API_ERROR_CODES] },
                message: { type: "string" },
              },
              required: ["code", "message"],
            },
          },
          required: ["error"],
        },
      },
    },
    paths,
  };
}
