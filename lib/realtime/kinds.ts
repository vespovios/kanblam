/**
 * Wire-format kinds for real-time sync events. Single source of truth — both
 * producer (mutation routes) and consumer (per-page subscribers) import from
 * here. A typo on either side becomes a TypeScript compile error.
 *
 * NOTE: `kanban_stages` and `priorities` are reserved-for-future. No mutation
 * route emits them yet (stages and priorities are seed-time only as of writing).
 * `kanban_stages` is subscribed-to by kanban surfaces in anticipation of
 * future stage CRUD; `priorities` is currently unsubscribed and unemitted.
 * When stage/priority CRUD ships, add `notifyWorkspace(ws, "kanban_stages")`
 * (or `"priorities"`) to the new mutation routes.
 */

/** Postgres NOTIFY/LISTEN channel used for workspace change events. */
export const WORKSPACE_CHANNEL = "workspace_changes" as const;

export type Kind =
  | "tasks"
  | "projects"
  | "tags"
  | "kanban_stages"
  | "priorities"
  | "holidays"
  | "working_days"
  | "members"
  | "recurring_templates"
  | "workspace";

export const ALL_KINDS: Kind[] = [
  "tasks",
  "projects",
  "tags",
  "kanban_stages",
  "priorities",
  "holidays",
  "working_days",
  "members",
  "recurring_templates",
  "workspace",
];
