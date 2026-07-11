# KanBlam — Project Memory

> This file briefs AI coding assistants (and fast-moving humans) on the
> project's rules and sharp edges. Deeper detail: `docs/ARCHITECTURE.md`,
> `docs/CONFIGURATION.md`, `docs/runbooks/`.

KanBlam is a self-hostable kanban / task manager. AGPL-3.0. Stack: Next.js 15
(App Router), React 19, TypeScript, Prisma + Postgres, Tailwind v4, Auth.js
v5. Single self-contained deploy — Docker Compose behind a Cloudflare Tunnel.

## Hard constraints

- **AGPL: all features free when self-hosted.** No feature-gating in the OSS
  product. Billing code paths must be hard no-ops without explicit opt-in
  (`BILLING_ENABLED` + token).
- **Analytics on public routes only** (`/`, `/login`, `/signup`, `/docs/*`).
  The authenticated app is never instrumented. Session replay disabled.
  Self-hosters opt out by default (empty `POSTHOG_KEY` = no-op).
- **Single-box architecture.** No queues, no Redis, no per-user compute.
  Postgres is also the realtime bus (LISTEN/NOTIFY → SSE).
- **Runtime config only.** No `NEXT_PUBLIC_` build-time env for anything a
  deployment might vary; one image serves prod, self-host, and demo.

## Conventions

- Mutations: zod validator (`lib/validators/`) → service function
  (`lib/<domain>/service.ts`, owns tenancy scoping) → thin API route →
  `notifyWorkspace()` so other tabs converge.
- Every domain query filters by `workspaceId`. Always.
- New tab-level UI must respect the global filter cascade.
- Every drag-and-drop surface must remain keyboard-operable (`@dnd-kit`
  keyboard sensors + `aria-live` announcements).
- Conventional commits; `npm run typecheck` + `next lint` clean before every
  commit; bump `package.json` version + add a CHANGELOG entry per release.
- Excel/date/serial parsing, currency and similar helpers already exist —
  search `lib/` before adding a second implementation of anything.

## Deployment gotchas

- The compose file enumerates the web service's env explicitly — **a new
  runtime-read env var must be added to `docker-compose.prod.yml` or it
  never reaches the container** (dev works, prod silently defaults).
- SSE through Cloudflare Tunnel needs HTTP/2 transport (QUIC buffers
  long-lived streams; set in compose — don't remove).
- `DEMO_MODE=1` must never be set on a deployment holding real data.

## Dev-environment gotchas

- `/docs` in `next dev` needs the `next-mdx-import-source-file` →
  `./mdx-components.tsx` turbopack alias in `next.config.ts` (Nextra's
  default doesn't resolve; prod webpack builds are unaffected). Don't remove.
- Stray lockfiles/`node_modules` in ANY parent folder hijack Next's inferred
  workspace root and break that alias with "createContext only works in
  Client Components". Check `ls ../package-lock.json` before debugging code.
  Don't pin `turbopack.root` — `__dirname` in the transpiled config resolves
  wrong and breaks the import map.
- Docs/marketing screenshots (`public/images/docs/`) come from the demo seed
  dataset — regenerate with `scripts/demo/` (headers document usage).
