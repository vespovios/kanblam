# KanBlam!

[![CI](https://github.com/vespovios/kanblam/actions/workflows/ci.yml/badge.svg)](https://github.com/vespovios/kanblam/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)

> Move work. Clear blockers.

KanBlam is a personal/small-team task management web app. Kanban board,
Eisenhower matrix, calendar, recurring tasks, daily dashboard, projects,
tags — five ways to look at the same work, one source of truth.

Open source under the [AGPL-3.0 license](./LICENSE). Run it yourself, or
use the hosted version at [kanblam.com](https://kanblam.com).

Everything on the board is also drivable over a documented
[REST API](https://kanblam.com/docs/api-quickstart) (personal access
tokens, [OpenAPI 3.1 spec](https://kanblam.com/openapi.json)) — scripts,
integrations, and AI agents welcome.

---

## Hosted at [kanblam.com](https://kanblam.com)

The hosted version is the same code as this repo, kept running and
backed up so you don't have to think about servers. Currently in
**closed beta** — drop your email on the landing page to be notified at
launch. Pricing is simple annual plans with a founding-user discount —
see [kanblam.com](https://kanblam.com) for current plans.

If "I'll handle the server myself, thanks" sounds like you — read on.

---

## Self-host

KanBlam is built around a small Docker stack: a single Next.js app + a
Postgres database. Anything else (Cloudflare Tunnel for ingress,
pg-backup for nightly dumps, ofelia for cron, Resend SMTP for email)
is optional and can be peeled off if you don't need it.

### Quick start (Docker Compose)

```bash
git clone https://github.com/vespovios/kanblam.git
cd kanblam
cp .env.example .env.prod

# Generate the three required secrets and fill them in .env.prod:
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
echo "CRON_SECRET=$(openssl rand -base64 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"

# Edit .env.prod — at minimum set:
#   LANDING_MODE=app              (skips the SaaS marketing page)
#   WAITLIST_ENABLED=false        (you don't need a waitlist)
#   NEXTAUTH_URL=https://your-domain
#   APP_URL=https://your-domain
#   DATABASE_URL inlining the POSTGRES_PASSWORD value
#   ADMIN_EMAIL / ADMIN_PASSWORD for the seed admin account
chmod 600 .env.prod

docker compose -f docker/docker-compose.prod.yml --env-file .env.prod up -d --build
```

Browse to your domain, log in with the seed `ADMIN_EMAIL` /
`ADMIN_PASSWORD`, change the password from Settings, and you're live.

### Full guides

- **[Architecture](./docs/ARCHITECTURE.md)** — how the whole thing is
  built: single-box topology, multi-tenancy, realtime over Postgres,
  recurring-task model, deployment modes.
- **[Configuration reference](./docs/CONFIGURATION.md)** — every
  environment variable, what it does, and which deployment sets it.
- **[Deployment runbook](./docs/runbooks/deployment.md)** — comprehensive
  step-by-step for a fresh Ubuntu VPS, including TLS via Cloudflare
  Tunnel, optional offsite backups, and update/rollback procedures.
- **[VPS host provisioning script](./scripts/vps-setup.sh)** — one-shot
  setup for a fresh Ubuntu 24.04 box (Docker, deploy user, swap, ufw,
  fail2ban, backup dir). Run as root on the new VPS.
- **[Changelog](./CHANGELOG.md)** — notable changes per release.

### Feature flags

The same codebase serves both the public SaaS at kanblam.com and
self-host deployments. A small set of env vars (see `lib/config/features.ts`)
controls SaaS-only behaviour:

| Flag | Default | Self-host value | What it does |
|---|---|---|---|
| `LANDING_MODE` | `marketing` | `app` | `marketing`: show the SaaS landing at `/`. `app`: redirect logged-out visitors to `/login`. |
| `WAITLIST_ENABLED` | `true` | `false` | Gates the `/api/waitlist` route and the waitlist form. |
| `BILLING_ENABLED` | `false` | `false` | Reserved for future Polar.sh billing integration. |

Recommended self-host `.env.prod`:

```bash
LANDING_MODE=app
WAITLIST_ENABLED=false
BILLING_ENABLED=false
```

### Updates

```bash
cd /path/to/kanblam
git pull
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod up -d --build
```

Migrations run automatically on container start via the `migrator`
service. Postgres data is preserved on the `tasker_pg_prod` volume.

---

## About

### Features

- **Kanban board** — drag tasks across stages; swimlane mode for
  multi-project visibility
- **Eisenhower matrix** — Important × Urgent quadrants for prioritisation
- **Calendar** — month and week views with drag-to-reschedule
- **Recurring tasks** — daily/weekly/monthly/custom cadences with
  Google-Calendar-style "this / this and following / all" edits
- **DayDash** — one dashboard combining "what needs me today" with
  shape-of-work charts and project progress
- **Projects + tags** — colour-coded organisation across all views
- **Multi-tenant** — every row is workspace-scoped, suitable for
  small-team use under a single installation
- **Real-time** — changes sync across browser tabs via SSE
- **Self-host AND hosted** — same code, two distribution channels

### Stack

- **Frontend:** Next.js 15 (App Router) · React 19 · TypeScript ·
  Tailwind CSS v4 · shadcn/ui · `@dnd-kit` for drag-and-drop ·
  recharts for the dashboard charts
- **Backend:** Next.js API routes · Postgres 16 · Prisma 6 ·
  Auth.js v5 (credentials + bcrypt)
- **Realtime:** Postgres LISTEN/NOTIFY → SSE
- **Docs site:** Nextra v4 served at `/docs`
- **Email:** nodemailer over SMTP (Resend recommended for prod)

---

## Develop

### Prerequisites

- Node.js 20 (see `.nvmrc`)
- Docker + Docker Compose (or Colima on macOS)
- `openssl` for generating secrets

### First-time local setup

```bash
git clone https://github.com/vespovios/kanblam.git
cd kanblam
npm install
cp .env.example .env

# Generate a real NEXTAUTH_SECRET:
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
# Paste into .env

npm run db:up         # Start Postgres + MailHog
npm run db:migrate    # Apply migrations
npm run db:seed       # Seed workspace + admin user + defaults
npm run dev           # Start the app
```

Open `http://localhost:3000` — sign in with `ADMIN_EMAIL` /
`ADMIN_PASSWORD` from `.env`. MailHog UI for reading dev emails:
`http://localhost:8025`.

### Day-to-day

```bash
npm run dev            # Start the app
npm run db:studio      # Browse the database
npm test               # Unit + integration tests
npm run test:e2e       # End-to-end tests
npm run typecheck      # tsc --noEmit
npm run lint           # next lint
```

### Test database

```bash
npm run db:test:setup  # Creates tasker_test if needed and applies migrations
```

Then run integration tests with that DB URL:

```bash
DATABASE_URL="postgresql://tasker:tasker@localhost:5432/tasker_test?schema=public" npm test
```

### Contributing

Issues and pull requests welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).
[ARCHITECTURE.md](./docs/ARCHITECTURE.md)
explains how everything fits together, [CONFIGURATION.md](./docs/CONFIGURATION.md)
covers every setting, and the
[deployment runbook](./docs/runbooks/deployment.md) covers production
operations.

---

## Credits

Public-holiday data is provided by the
[date-holidays](https://github.com/commenthol/date-holidays) project and is
licensed under **CC BY-SA 3.0**. KanBlam bundles it for fully-offline holiday
import (Settings → Holidays → Import public holidays) — no external API is
contacted.

---

## License

KanBlam is released under the **GNU Affero General Public License
v3.0** ([full text](./LICENSE)).

The AGPL is a copyleft license with a network-use clause: if you run a
modified version as a network service (a SaaS-style deployment), the
modifications must be made available under the same license. Unmodified
self-hosting is unrestricted.

Hosted KanBlam at kanblam.com is the same code, run by the project
maintainer as a service for users who don't want to manage their own
deployment. Subscriptions support continued development.
