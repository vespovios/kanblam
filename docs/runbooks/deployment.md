# KanBlam Deployment Runbook

> **Scope:** Production deploy to an Ubuntu 24.04 LTS VPS behind Cloudflare Tunnel at `kanblam.com`. First workspace (Peter) is created by the migrator seed; additional beta tenants are provisioned with `scripts/create-workspace.ts`.
>
> **Spec:** the original deployment design doc (2026-05-12, private archive) — most of it carries over; treat its storage-layer section as superseded by the VPS local-disk setup below.

## Prerequisites

### VPS host

- [ ] Ubuntu 24.04 LTS, **2 vCPU / 4 GB RAM / 40 GB SSD** (the build runs on the box; 4 GB keeps `next build` away from OOM-kill).
- [ ] Host provisioned with `scripts/vps-setup.sh` — that gets you Docker Engine + Compose, a non-root `deploy` user (in the `docker` group), a 2 GB swapfile, ufw allowing SSH only, fail2ban, unattended security upgrades, `/srv` (owned by `deploy`), and `/srv/kanblam-backups` (owned by uid 70 for the pg-backup container). Verify: `docker version`, `docker compose version`, `swapon --show`, `ls -ld /srv /srv/kanblam-backups`.
- [ ] SSH access for the `deploy` user (the setup script copies root's `authorized_keys` over).
- [ ] At least 5 GB free under `/var/lib/docker` (postgres data + image cache).

### Cloudflare

- [ ] Domain `kanblam.com` on Cloudflare (nameservers pointed at CF).
- [ ] Cloudflare Zero Trust account (free).
- [ ] In CF dashboard → Zero Trust → Networks → Tunnels: click **Create a tunnel**, choose **Cloudflared**, name it `kanblam-prod`. Copy the **token** — that's your `CF_TUNNEL_TOKEN`. Click **Next**.
- [ ] Public hostname: subdomain (`@` for apex, or `www`), domain `kanblam.com`, type `HTTP`, URL `web:3000`. Save.

### Resend

- [ ] Resend account (free tier covers 3k emails/mo).
- [ ] In Resend dashboard → Domains: add `kanblam.com`, follow the DKIM/SPF/DMARC instructions. Records go into CF DNS (Cloudflare dashboard → DNS). Wait for "Verified" status (~5–10 min).
- [ ] Resend → API Keys: create a new key named `kanblam-prod`. That's your `SMTP_PASS`.

### healthchecks.io (optional but recommended)

- [ ] Free account.
- [ ] Create a check named **KanBlam pg-backup**, period **1 day**, grace **2 hours**.
- [ ] Copy the **Ping URL UUID** — the part after `/ping/` or the `<uuid>` portion of the URL. That's your `HEALTHCHECKS_BACKUP_UUID`.

## First deploy

### 1. Clone the repo

```bash
cd /srv
git clone <repo-url> kanblam
cd kanblam
```

### 2. Generate secrets

```bash
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
echo "CRON_SECRET=$(openssl rand -base64 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24)"
```

Keep this output handy for the next step. **Never paste these into a shell history that gets backed up.**

### 3. Create `.env.prod`

```bash
cp .env.example .env.prod
chmod 600 .env.prod
$EDITOR .env.prod
```

Fill in **every value** in `.env.prod` (use the secrets you just generated, plus the CF tunnel token, Resend API key, healthchecks.io UUID, etc.). The final file should look like:

```bash
# App
NEXTAUTH_SECRET=<from openssl rand step>
NEXTAUTH_URL=https://kanblam.com
APP_URL=https://kanblam.com
AUTH_TRUST_HOST=true
CRON_SECRET=<from openssl rand step>
# NEXT_PUBLIC_CRON_SECRET intentionally NOT SET in prod.

# Database
POSTGRES_PASSWORD=<from openssl rand step>
DATABASE_URL=postgresql://tasker:<POSTGRES_PASSWORD>@postgres:5432/tasker?schema=public

# Email
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=<Resend API key>
SMTP_FROM="KanBlam <noreply@kanblam.com>"

# Workspace seed — bootstraps Peter's workspace on first migrator run.
# The other beta tenants are provisioned in step 5 with create-workspace.ts;
# leave SEED_MEMBER_* empty here (they were only ever for adding a SECOND
# user to the SAME seeded workspace, which we don't want under multi-tenant).
WORKSPACE_NAME=Peter's Workspace
ADMIN_EMAIL=peter@kanblam.com
ADMIN_PASSWORD=<a strong password — change on first login>
ADMIN_NAME=Peter
SEED_MEMBER_EMAIL=
SEED_MEMBER_PASSWORD=
SEED_MEMBER_NAME=

# Cloudflare Tunnel
CF_TUNNEL_TOKEN=<from CF Zero Trust>

# Backups — VPS local path (no NAS). vps-setup.sh created this with uid 70.
BACKUP_HOST_PATH=/srv/kanblam-backups
BACKUP_HOUR_UTC=03
BACKUP_RETENTION_DAYS=30
HEALTHCHECKS_BACKUP_UUID=<from healthchecks.io>
```

**Important:** `DATABASE_URL` must inline the actual `POSTGRES_PASSWORD` value (not the `${POSTGRES_PASSWORD}` reference) — Docker Compose's `--env-file` reads .env files literally and does NOT recursively expand `${VAR}` references between lines. After substitution, the line reads e.g. `DATABASE_URL=postgresql://tasker:vK9p3...=@postgres:5432/tasker?schema=public`.

> **Offsite backup gap:** `/srv/kanblam-backups` is on the same VPS. If the VPS dies, the backups die with it. For Phase 0 beta this is acceptable; offsite sync (Backblaze B2 + restic, or `rclone copy` to S3) is in *Future work* below and should land before you take real paying customers.

### 4. Launch the stack

```bash
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod --profile tunnel up -d --build
```

This will:
1. Build the `web` runner image and the `migrator` builder image (~3–5 min on first build on a 4 GB box).
2. Start postgres; wait for it to be healthy.
3. Run `migrator` once: applies migrations and seeds Peter's workspace.
4. Start `web`; wait for healthy.
5. Start `cloudflared`, `cron-runner`, `pg-backup`.

Tail logs to watch progress: `docker compose -f docker/docker-compose.prod.yml --env-file .env.prod logs -f`.

### 5. Provision the other beta tenants

The seed handles Peter's workspace. For each additional beta user, run the provisioning script in a one-shot `migrator` container (the `web` runner is a minimal standalone image without `tsx`; the `migrator` builder stage has the full toolchain):

```bash
# Wife
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod \
  run --rm migrator npx tsx scripts/create-workspace.ts \
  --workspace "<Wife's Name>'s Workspace" \
  --email "<wife@example.com>" \
  --name "<Wife>"

# Friend
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod \
  run --rm migrator npx tsx scripts/create-workspace.ts \
  --workspace "<Friend's Name>'s Workspace" \
  --email "<friend@example.com>" \
  --name "<Friend>"
```

Omit `--password` and a strong random one is generated and printed once — copy it. Use `--dry-run` first if you want to validate args + check the email is free without writing anything.

### 6. Verify

#### Smoke checklist

- [ ] `docker compose -f docker/docker-compose.prod.yml --env-file .env.prod ps` shows all six services either `running` (postgres, web, cloudflared, cron-runner, pg-backup) or `exited (0)` (migrator).
- [ ] `docker compose ... logs migrator | grep "Created admin user"` shows Peter's email.
- [ ] `docker compose ... exec web wget -qO- http://localhost:3000/api/health` returns `{"ok":true}`.
- [ ] Browser → `https://kanblam.com` loads the landing page with a valid TLS cert (CF-issued).
- [ ] Log in as Peter; you land on `/dashboard`.
- [ ] Log in as wife (different browser / incognito); you see *only* her workspace's data.
- [ ] Log in as friend (third browser / second incognito); same — fully isolated.
- [ ] **Tenant isolation spot-check:** create a task in wife's workspace, then try to open it by URL from Peter's session — must 404 / not be found.
- [ ] **SSE smoke:** two browser tabs in the same workspace both open `/kanban`. Drag a card in tab A; tab B updates within ~200ms without a refresh.
- [ ] **Cron smoke:** `docker compose ... logs cron-runner` shows ofelia firing every 5 min. After one tick, `docker compose ... logs web | grep "cron/generate-recurring-tasks"` should show a 200 response.
- [ ] **Backup smoke:** force a backup immediately:
  ```bash
  docker compose -f docker/docker-compose.prod.yml --env-file .env.prod \
    exec pg-backup /scripts/backup.sh run-once
  ```
  Verify a `.dump.gz` file exists in `/srv/kanblam-backups/`.
- [ ] **healthchecks.io smoke:** the forced backup pings the dead-man's-switch. Check the healthchecks.io UI — the check should show green and "Last ping: a few seconds ago".

#### First-login password changes

All three beta users should change their passwords on first login. There's no UI prompt enforcing this — they go to **Settings → Profile** and set new passwords. Until then, the plaintext value lives in `.env.prod` (for Peter) or in the script output (for the other two).

## Updates

When you've pushed new commits to the repo:

```bash
cd /srv/kanblam
git pull
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod --profile tunnel up -d --build
```

Compose only restarts services whose images or env changed. If only the `web` image rebuilt, expect ~30 s of `502 Bad Gateway` on `kanblam.com` during the cutover; cloudflared reconnects automatically once `web` is healthy again.

If a migration is part of the update, the `migrator` service runs it transparently before `web` starts. To inspect a migration before applying:

```bash
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod \
  run --rm migrator npx prisma migrate status
```

## Restore from backup

```bash
# 1. List available dumps:
ls -lt /srv/kanblam-backups/ | head

# 2. Stop the web container (avoid concurrent writes during restore):
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod stop web

# 3. Restore (replace TIMESTAMP with the dump you want):
gunzip -c /srv/kanblam-backups/tasker-TIMESTAMP.dump.gz | \
  docker compose -f docker/docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  pg_restore -U tasker -d tasker --clean --if-exists

# 4. Restart web:
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod start web
```

## Rollback

Roll the code back, rebuild, redeploy:

```bash
cd /srv/kanblam
git log --oneline -10              # find the SHA you want
git checkout <prev-sha>
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod --profile tunnel up -d --build
```

If the rollback also requires a DB rollback (a migration in the rolled-back commits modified the schema), do the **restore-from-backup** procedure first using the most recent backup taken BEFORE the bad migration.

## Failure-mode recovery

| Symptom | Cause | Recovery |
|---|---|---|
| `kanblam.com` shows CF error page | `cloudflared` container down or tunnel disconnected | `docker compose ... restart cloudflared`; check CF Zero Trust dashboard tunnel status |
| `502 Bad Gateway` from CF | `web` unhealthy or down | `docker compose ... logs web`; restart if needed |
| `migrator` exited non-zero (visible in `docker compose ps`) | Migration failed | `docker compose ... logs migrator`; fix the migration locally, push, redeploy. To re-run after fix: `docker compose ... up -d migrator` |
| 500 errors on every API route | Postgres down or auth broken | `docker compose ... logs postgres web`; restart postgres if needed; if persistent, check `DATABASE_URL` matches `POSTGRES_PASSWORD` |
| healthchecks.io email "KanBlam pg-backup is DOWN" | Last 24h's backup never ran or never pinged | `docker compose ... logs pg-backup`; verify `/srv/kanblam-backups/` exists and is writable by uid 70 (`ls -ldn /srv/kanblam-backups` should show `70 70`); force a manual run with `run-once` |
| `pg-backup` logs `permission denied` on `/backups/*` | Local backup dir lost its uid-70 ownership | `sudo chown 70:70 /srv/kanblam-backups && docker compose ... restart pg-backup` |
| Recurring tasks not generating | `cron-runner` or `web` cron route broken | `docker compose ... logs cron-runner web \| grep recurring`; check that `CRON_SECRET` matches between `.env.prod` and the ofelia label expansion |
| `next build` OOM-killed during `up --build` | 4 GB box + busy postgres at build time | Stop postgres first: `docker compose ... stop postgres`, run the build alone (`up -d --build --no-deps migrator web`), then `start postgres`. Or bump the VPS to 6 GB. The swapfile vps-setup.sh adds usually catches this. |
| Disk filling under `/var/lib/docker` | Image / build-cache accumulation | `docker system prune -af --volumes` (skip `--volumes` if you want to keep postgres data — and you do) |

## Operational quick reference

```bash
# Tail all logs:
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod logs -f

# Tail one service:
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod logs -f web

# Shell into postgres:
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod \
  exec postgres psql -U tasker tasker

# Shell into web (Alpine, no apt — only apk and sh):
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod exec web sh

# Run a one-shot admin script (has tsx + the full source tree):
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod \
  run --rm migrator npx tsx scripts/<name>.ts <args...>

# Force a backup right now:
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod \
  exec pg-backup /scripts/backup.sh run-once

# Stop the stack:
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod down

# Stop AND remove the postgres volume (DESTRUCTIVE — wipes the DB):
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod down -v
```

## Future work (out of scope for this runbook)

- **Tier-2 offsite backups** — `restic` to Backblaze B2 (or `rclone` to S3), nightly after the local `pg_dump`. Higher priority on a VPS than on the ZimaOS box was, since there's no NAS to fall back on if the VPS itself is lost.
- **GHCR image registry pipeline** — build images in CI, pull on the VPS. Eliminates the build-on-box RAM pressure and the cutover gap.
- **Forced-password-change UI on first login** — needed once self-serve signup ships and we're no longer hand-provisioning every account.
- **Self-serve signup + billing** — Phase 1 / Phase 2 of the SaaS plan; see `KanBlam-SaaS-Plan.md` in the workspace root.
