# Changelog

Notable changes per release. Dates are release dates on the hosted service.

## 0.13.0 — 2026-07-12

- **Agent Members**: AI agents as first-class workspace members. Create an
  agent in Settings → Members, mint it an API token (admin-only, shown once),
  and assign it tasks — it works through `/api/v1` and everything it does is
  attributed to it on the board.
- Agent chip across member lists, pickers, and comments.
- Members API gains `kind: human|agent`.
- Free on every plan; capped per workspace (`AGENT_MEMBERS_MAX`, default 5).
  Docs: [agents](https://kanblam.com/docs/agents).
- Demo workspace now ships with a "Flight Computer" agent.

## 0.12.0 — 2026-07-10

- **Public REST API** at `/api/v1`: tasks (filterable, cursor-paginated,
  create/update/delete/move), subtasks, comments, projects, tags, and
  reference data — everything a script, integration, or AI agent needs to
  work a board. Docs: [quickstart](https://kanblam.com/docs/api-quickstart)
  + [reference](https://kanblam.com/docs/api) + machine-readable
  [OpenAPI 3.1 spec](https://kanblam.com/openapi.json), generated from the
  same validators the routes run — CI fails if spec and behaviour drift.
- **Personal access tokens** (Settings → API tokens): hashed at rest,
  shown once, `read`/`write` scopes, revocable, per-token rate limiting
  (120/min). A token acts as its user; `/api/v1` never accepts cookies.
- **Task comments**: plain-text, chronological comments on tasks — in the
  task drawer and over the API. Delete your own; admins moderate.
- API mutations broadcast the same realtime events as the app, so open
  boards follow API-driven changes live.

## 0.11.0 — 2026-07-06

- **Instant demo.** `DEMO_MODE=1` deployments serve `/demo`: a throwaway,
  pre-seeded workspace (the "Stratos-1" balloon-mission dataset) with
  automatic sign-in — no account needed. Demo tenants are reaped nightly
  after `DEMO_TTL_HOURS`. Live at [try.kanblam.com/demo](https://try.kanblam.com/demo).
- Landing page gains Demo links (nav + hero) when `DEMO_URL` is set.
- Dismissible "this is a demo" banner inside demo deployments.
- Fix: feature-flag env vars (`LANDING_MODE`, `WAITLIST_ENABLED`, demo
  vars) are now actually passed into the web container by compose.

## 0.10.1 — 2026-07-05

- **Docs overhaul:** four new pages (DayDash; Tasks, subtasks & tags;
  Projects; Import from Asana), screenshots and usage recipes throughout,
  powered by the Stratos-1 demo dataset.
- **Landing features rebuilt:** five screenshot+copy sections for the main
  views plus a feature grid; real product screenshots replace mockups.
- Repeatable screenshot pipeline in `scripts/demo/`.

## 0.10.0 — 2026-06-01

- **Bulk holiday import:** pick a country (and sub-region) and year,
  preview, select, import — offline rule-based computation via
  `date-holidays`, dedupe-safe re-runs.

## 0.9.x — 2026-06-01

- Billing infrastructure (Polar.sh): checkout, webhook sync, enforcement
  surfaces, hourly reconcile — behind `BILLING_ENABLED`, hard-off for
  self-host (0.9.0).
- Landing pricing localized to the visitor's currency (0.9.1).
- Beta-feedback UX: task-list completion states + Stage column, DayDash
  alignment fixes, "Hide completed" honored on project tabs (0.9.2).

## 0.8.x — 2026-05

- In-app **Asana importer** (Settings → Import from Asana) (0.8.7).
- Move tasks between projects (0.8.6).
- Kanban "Backlog" column became **On Hold**; "Pending" project status
  dropped (beta feedback) (0.8.8).
- **Accessibility pass:** keyboard drag-and-drop across all five DnD
  surfaces with screen-reader announcements (0.8.0).
- Docs site with sidebar + first eight content pages (0.8.1).
- Profile name editing, free-text task search, invite management (0.8.2/3).
- Privacy posture: analytics on public routes only, cookieless, session
  replay disabled (0.8.4/5).

## 0.7.x — 2026-05-18

- AGPL-3.0 license, feature flags for self-host, README restructure (0.7.2).
- Password change UI (0.7.0); mobile filter sheet (0.7.1).

## 0.5.x–0.6.x — 2026-05-16

- **Closed beta launch:** hosted at kanblam.com behind Cloudflare Tunnel,
  marketing landing + waitlist, recurring-tasks rework, security headers,
  workspace rename, realtime sync over SSE.

## 0.2.0–0.4.0 — 2026-05

- Early development: topbar navigation with cascading global filters,
  Soft Slate design language, collapsible kanban swim lanes, DayDash
  dashboard with charts and project progress.
