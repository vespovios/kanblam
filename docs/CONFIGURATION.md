# Configuration reference

Every environment variable KanBlam reads, what it does, and where it must be
set. Companion to [`ARCHITECTURE.md`](./ARCHITECTURE.md) and the
[deployment runbook](./runbooks/deployment.md).

## How configuration reaches the app

Two different mechanisms, and mixing them up is the #1 deployment footgun:

- **Local dev (`next dev`)** reads `.env` directly — every variable in the
  file is visible to the app.
- **Docker deployments** use the env file only to *interpolate the compose
  YAML* (`--env-file .env.prod`). A variable reaches the running container
  **only if it is enumerated in the `environment:` block** of the relevant
  service in `docker/docker-compose.prod.yml`.

> **Rule: when you add a new `process.env.X` read to the app, add
> `X: ${X:-<default>}` to the web service's `environment:` block in the same
> PR.** Otherwise it works in dev and silently uses the default in
> production.

All app configuration is read **at runtime** (no `NEXT_PUBLIC_` build-time
inlining) — one Docker image serves every deployment flavour; behaviour is
decided entirely by env.

## Deployment flavours

| Flavour | Env file | Distinguishing settings |
|---|---|---|
| Hosted SaaS (kanblam.com) | `.env.prod` | `LANDING_MODE=marketing`, `WAITLIST_ENABLED=true`, `DEMO_URL` set |
| Self-host | `.env.prod` | `LANDING_MODE=app`, `WAITLIST_ENABLED=false` |
| Instant demo (try.kanblam.com) | `.env.demo` | `DEMO_MODE=1`, `LANDING_MODE=app`, own Postgres + tunnel, compose project `-p kanblam-demo` |

## Core

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXTAUTH_SECRET` | ✅ | — | Auth.js session-JWT signing secret. Generate with `openssl rand -base64 32`. Rotating it signs everyone out. |
| `NEXTAUTH_URL` | ✅ | — | Canonical public URL of this deployment (`https://kanblam.com`). Auth.js callback base. |
| `APP_URL` | ✅ | — | Public URL used when the app builds absolute links (invite emails etc.). Normally identical to `NEXTAUTH_URL`. |
| `AUTH_TRUST_HOST` | — | `true` (compose) | Auth.js v5 host-validation opt-out. Required behind Cloudflare Tunnel, where the Host header is the public hostname. Leave `true` unless you know why not. |
| `CRON_SECRET` | ✅ | — | Bearer token protecting the `/api/cron/*` endpoints. The ofelia cron-runner passes it; anything without it gets 401. |
| `NODE_ENV` | — | `production` (compose) | Standard Node flag. Compose pins it; don't set manually. |

## Database

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | Postgres connection string. **Inside compose the host is the service name `postgres`, not `localhost`**: `postgresql://tasker:<password>@postgres:5432/tasker?schema=public`. Read by the web app, the migrator, and Prisma CLI. |
| `POSTGRES_PASSWORD` | ✅ (compose-only) | — | Password for the bundled Postgres container. Must match the one inlined in `DATABASE_URL`. Baked into the data volume on first boot. |

## Email (SMTP)

Used for team invites and waitlist notifications. Dev default is MailHog
(`npm run db:up` starts it on `localhost:1025`); production uses any SMTP
relay (kanblam.com uses Resend).

| Variable | Required | Default | Description |
|---|---|---|---|
| `SMTP_HOST` / `SMTP_PORT` | ✅ | — | Relay host/port. |
| `SMTP_USER` / `SMTP_PASS` | — | empty | Relay credentials; empty = unauthenticated (MailHog). |
| `SMTP_FROM` | ✅ | — | From header, e.g. `"KanBlam <noreply@kanblam.com>"`. |
| `WAITLIST_NOTIFY_TO` | — | `ADMIN_EMAIL` | Inbox that receives `/api/waitlist` signup notifications. |

## First-run seed (migrator only)

Read once by the `migrator` service (`prisma db seed`) when the database is
empty; ignored afterwards.

| Variable | Required | Default | Description |
|---|---|---|---|
| `WORKSPACE_NAME` | ✅ | — | Name of the first workspace. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | ✅ | — | The first (admin) user. Change the password from Settings after first login. |
| `SEED_MEMBER_EMAIL` / `SEED_MEMBER_PASSWORD` / `SEED_MEMBER_NAME` | — | empty | Optional second user (MEMBER role). Empty email = skipped. |

Additional workspaces are provisioned with
`npx tsx scripts/create-workspace.ts` (see the script header).

## Feature flags

Parsed in `lib/config/features.ts`; all runtime.

| Variable | Default | Description |
|---|---|---|
| `LANDING_MODE` | `marketing` | What `/` shows logged-out visitors. `marketing` = SaaS landing page; `app` = redirect to `/login` (self-host & demo boxes). |
| `WAITLIST_ENABLED` | `true` | Gates `POST /api/waitlist` (404 when off) and hides the landing waitlist form. Self-hosters: `false`. |
| `BILLING_ENABLED` | `false` | Master switch for the Polar.sh billing integration. Hard no-op when false or when `POLAR_ACCESS_TOKEN` is empty (fail-safe). Self-hosters never set this — AGPL means all features free. |

## Instant demo (try.kanblam.com)

See `docs/runbooks/demo-deployment.md`. The demo runs as a **separate,
isolated compose stack** — never enable `DEMO_MODE` on a box holding real
tenants.

| Variable | Default | Set on | Description |
|---|---|---|---|
| `DEMO_MODE` | unset | demo stack only | `1` enables `/demo` + `POST /api/demo` (throwaway pre-seeded workspaces, auto sign-in) and arms the cleanup cron. Anything else: those routes 404 / no-op. |
| `DEMO_TTL_HOURS` | `24` | demo stack | Age at which demo workspaces are reaped by the nightly `cleanup-demo-workspaces` cron. |
| `DEMO_URL` | unset | marketing/prod stack only | Absolute URL of the demo (`https://try.kanblam.com/demo`). When set, the landing page renders the Demo nav link and hero button. |

## Public API

| Variable | Default | Description |
|---|---|---|
| `API_RATE_LIMIT_PER_MIN` | `120` | Per-token request budget for `/api/v1` (sliding minute window, in-memory). Mostly exists so tests can drop it low; production deployments rarely need to touch it. |

## Billing (Polar.sh — hosted service only)

All empty for self-host. Billing activates only when `BILLING_ENABLED=true`
**and** a token is present; missing product ids then error loudly.

| Variable | Description |
|---|---|
| `POLAR_ENV` | `production` (default; also used for test-mode tokens) or literal `sandbox` for the legacy isolated sandbox host. |
| `POLAR_ACCESS_TOKEN` | Organization access token. Empty = billing stays off even if enabled (logged once). |
| `POLAR_PRODUCT_HOSTED_STANDARD_MONTHLY` / `..._ANNUAL` | Polar product ids per tier/cadence. |
| `POLAR_WEBHOOK_SECRET` | Standard-Webhooks signing secret for `/api/billing/webhook`; fails closed when empty. |

## Analytics (PostHog — optional, public routes only)

Server-injected into the root layout (no `NEXT_PUBLIC_` prefix — values are
passed as props at request time, so they stay runtime-configurable). Both
empty = provider is a no-op, no script loads. The authenticated app is
**never** instrumented; session replay is disabled. Self-hosters leave blank.

| Variable | Default | Description |
|---|---|---|
| `POSTHOG_KEY` | empty | Project API key. Empty disables analytics entirely. |
| `POSTHOG_HOST` | `https://eu.i.posthog.com` | PostHog ingestion host. |

## Infrastructure (compose-only)

Consumed by `docker/docker-compose.prod.yml` itself, never by app code.

| Variable | Required | Description |
|---|---|---|
| `CF_TUNNEL_TOKEN` | with `--profile tunnel` | Cloudflare Tunnel connector token (Zero Trust → Networks → Tunnels). Each stack (prod, demo) runs its own tunnel. |
| `BACKUP_HOST_PATH` | ✅ | Host directory bind-mounted into the `pg-backup` sidecar for nightly `pg_dump`s. Compose refuses to start without it. |
| `BACKUP_HOUR_UTC` | — (`03`) | Hour of the nightly dump. |
| `BACKUP_RETENTION_DAYS` | — (`30`) | Dumps older than this are pruned. |
| `HEALTHCHECKS_BACKUP_UUID` | — | healthchecks.io dead-man's-switch UUID pinged after each successful backup. Empty disables the ping. |

## Dev-only

Never set in any deployed environment.

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_CRON_SECRET` | Dev mirror of `CRON_SECRET` so the local "Generate now" helper can hit the cron endpoint from the browser. `NEXT_PUBLIC_` = baked into the client bundle — which is exactly why it must never hold a production secret. |
| `KB_BASE` / `KB_EMAIL` / `KB_PASS`, `CHROMIUM_BIN`, `PART` / `SHOTS` / `HERO` | Inputs to the demo-seed and screenshot-capture scripts in `scripts/demo/` (see their headers). |
| `DRY_RUN` | Honoured by some maintenance scripts. |
