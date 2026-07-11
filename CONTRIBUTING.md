# Contributing to KanBlam

Thanks for taking an interest! KanBlam is a deliberately small product with
strong opinions — this page tells you how to work on it without friction.

## Ground rules

- **Read [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) first.** It's
  short and explains the constraints (single box, runtime-only config,
  AGPL all-features-free) that PRs are reviewed against.
- **Open an issue before building a feature.** KanBlam says no to most
  feature ideas on purpose — a two-line issue saves you a weekend. Bug
  fixes: just send the PR.
- Be kind; assume good faith.

## Dev setup

The short version (details in the README):

```bash
git clone https://github.com/vespovios/kanblam.git
cd kanblam && npm install
cp .env.example .env      # set NEXTAUTH_SECRET (openssl rand -base64 32)
npm run db:up             # Postgres + MailHog via Docker
npm run db:migrate && npm run db:seed
npm run dev
```

Log in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your `.env`.

## Before you push

CI enforces all of these; save yourself a round trip:

```bash
npm run typecheck   # tsc --noEmit, strict — must be clean
npx next lint       # eslint — must be clean
npm test            # vitest (needs the test DB: npm run db:test:setup)
```

## Conventions that matter

- **Conventional commits** (`feat:`, `fix:`, `docs:`, `chore:`…).
- **Mutations flow through the service layer:** zod validator
  (`lib/validators/`) → `lib/<domain>/service.ts` (owns workspace scoping)
  → thin API route → `notifyWorkspace()`. Don't query Prisma from routes
  or components for writes.
- **Every domain query filters by `workspaceId`.** No exceptions.
- **New runtime env vars** must be added to `.env.example`,
  `docs/CONFIGURATION.md`, *and* the web service's `environment:` block in
  `docker/docker-compose.prod.yml` — dev reads `.env` directly but the
  container only receives enumerated vars.
- **Accessibility is load-bearing:** anything drag-and-drop must stay
  keyboard-operable (`@dnd-kit` keyboard sensors + `aria-live`
  announcements). PRs that regress this won't land.
- **Schema changes** ship as committed Prisma migrations
  (`npx prisma migrate dev --name <what-changed>`).
- UI uses the semantic Tailwind tokens (`bg-background`,
  `text-muted-foreground`, …), never raw colours; both themes must work.

## Pull requests

- Target `main`; keep PRs focused (one concern per PR).
- Describe *why*, not just what — a sentence or two is fine.
- Add or update tests when you touch service-layer logic.
- Update docs (`/docs` site pages, CONFIGURATION.md) when behaviour or
  config changes.

## Reporting bugs & security issues

- Bugs: [GitHub issues](https://github.com/vespovios/kanblam/issues) —
  include what you did, what you expected, what happened, and your
  deployment flavour (hosted / self-host / dev).
- **Security vulnerabilities: do not open a public issue.** Email
  security@kanblam.com and give us a reasonable window to fix before
  disclosure.

## License

KanBlam is AGPL-3.0. By contributing you agree your contributions are
licensed under the same terms.
