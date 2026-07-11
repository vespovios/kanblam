# Demo deployment — try.kanblam.com

A second, fully isolated KanBlam stack on the same VPS that serves the
Vikunja-style instant demo: a visitor hits `/demo`, gets a throwaway
workspace pre-seeded with the Stratos-1 mission, and is signed in
automatically. Demo tenants are reaped after `DEMO_TTL_HOURS`.

**Why a separate stack:** abuse, junk data, and load on the demo can never
touch production tenants, the waitlist, or billing. Prod never runs with
`DEMO_MODE=1`, so the demo endpoints don't even exist there.

## How it works (app side)

- `POST /api/demo` (only when `DEMO_MODE=1`) — provisions workspace + user
  (`lib/demo/provision.ts`), seeds the Stratos-1 dataset server-side
  (`lib/demo/seed-stratos.ts`, dates relative to seed time), returns
  one-time credentials. Rate limits: 3/hour per IP, 30/hour global,
  500 live demos max.
- `/demo` — narrated launcher page; calls the endpoint, signs in via the
  normal credentials provider, redirects to DayDash. `noindex`.
- `POST /api/cron/cleanup-demo-workspaces` — Bearer `CRON_SECRET`; deletes
  `isDemo` workspaces older than `DEMO_TTL_HOURS` (default 24). Cascade
  removes everything. No-op unless `DEMO_MODE=1`.
- Landing hero on the **prod** site shows the demo button only when
  `DEMO_URL` is set.

## Standing it up

```bash
cd /srv
git clone https://github.com/vespovios/kanblam.git kanblam-demo
cd kanblam-demo
cp .env.example .env.demo
```

`.env.demo` — like `.env.prod`, plus/minus:

```
DEMO_MODE=1
DEMO_TTL_HOURS=24
LANDING_MODE=app            # no marketing page on the demo box
WAITLIST_ENABLED=false
NEXTAUTH_URL=https://try.kanblam.com
APP_URL=https://try.kanblam.com
# fresh NEXTAUTH_SECRET, CRON_SECRET, POSTGRES_PASSWORD (openssl rand …)
# DATABASE_URL points at THIS stack's postgres (separate volume)
# ADMIN_EMAIL/ADMIN_PASSWORD: seed admin — pick throwaways, it's a demo box
```

Tunnel: create a **second Cloudflare Tunnel** in the CF dashboard with
public hostname `try.kanblam.com` → `http://web:3000`, and put its token in
`.env.demo` as `CF_TUNNEL_TOKEN` (each stack runs its own `cloudflared`;
nothing is published on host ports).

Run it under a distinct compose project name so volumes/networks don't
collide with prod:

```bash
docker compose -p kanblam-demo -f docker/docker-compose.prod.yml \
  --env-file .env.demo --profile tunnel up -d --build
```

## Cron

Nothing to add by hand — the ofelia job `cron-demo-cleanup` (nightly 04:15)
ships in the shared compose file and calls
`/api/cron/cleanup-demo-workspaces` with the stack's own `CRON_SECRET`.
On prod the route answers `{skipped}` because `DEMO_MODE` isn't set; on the
demo stack it reaps expired tenants. Belt-and-braces option: also wire a
monthly full reset — stop stack, drop the demo Postgres volume, `up -d` —
but TTL reaping alone keeps the box tidy.

## Prod side

Add to prod's `.env.prod` and redeploy:

```
DEMO_URL=https://try.kanblam.com/demo
```

## Updating

Same as prod: `git pull` in `/srv/kanblam-demo`, compose `up -d --build`
with `-p kanblam-demo`. Migrations run on start. Update prod and demo
together so screenshots/docs/demo stay in step.
