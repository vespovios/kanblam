/**
 * Provision a new workspace + its admin user, with the default statuses,
 * priorities, and kanban stages. This is the multi-tenant counterpart to
 * `prisma/seed.ts` — the seed bootstraps the *first* workspace and bails if
 * one already exists; this script creates *another* one every time.
 *
 * Phase 0 of the SaaS rollout uses it to stand up the beta accounts by hand,
 * before self-serve signup exists. Once signup ships, this stays useful for
 * support / admin provisioning.
 *
 * Run (against whatever DATABASE_URL .env / the environment points at):
 *   npx tsx scripts/create-workspace.ts \
 *     --workspace "Peter's Workspace" \
 *     --email peter@example.com \
 *     --name "Peter" \
 *     --password "a-strong-password"
 *
 * --password is optional: omit it and a strong random one is generated and
 * printed once. --role is optional and defaults to ADMIN (each beta user
 * owns their own workspace).
 *
 * Dry run (validate args + check the email is free, write nothing):
 *   npx tsx scripts/create-workspace.ts --workspace "..." --email "..." --name "..." --dry-run
 *
 * Against a different DB:
 *   DATABASE_URL=postgresql://... npx tsx scripts/create-workspace.ts ...
 */

import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  DEFAULT_STATUSES,
  DEFAULT_PRIORITIES,
  DEFAULT_KANBAN_STAGES,
} from "../prisma/seedWorkspace";

const prisma = new PrismaClient();

interface Args {
  workspace: string;
  email: string;
  name: string;
  password?: string;
  role: "ADMIN" | "MEMBER";
  dryRun: boolean;
}

/** Minimal `--flag value` parser — no dependency needed for four flags. */
function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : undefined;
  };

  const workspace = get("--workspace");
  const email = get("--email")?.trim().toLowerCase();
  const name = get("--name");
  const password = get("--password");
  const roleArg = get("--role")?.toUpperCase();
  const dryRun = argv.includes("--dry-run");

  const missing: string[] = [];
  if (!workspace) missing.push("--workspace");
  if (!email) missing.push("--email");
  if (!name) missing.push("--name");
  if (missing.length > 0) {
    throw new Error(
      `Missing required flag(s): ${missing.join(", ")}\n` +
        `Usage: npx tsx scripts/create-workspace.ts --workspace "Name" --email a@b.com --name "Person" [--password "..."] [--role ADMIN|MEMBER] [--dry-run]`,
    );
  }

  // Loose email sanity check — not RFC-perfect, just catches fat-fingers.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email!)) {
    throw new Error(`"${email}" doesn't look like an email address.`);
  }

  if (roleArg && roleArg !== "ADMIN" && roleArg !== "MEMBER") {
    throw new Error(`--role must be ADMIN or MEMBER (got "${roleArg}").`);
  }

  if (password !== undefined && password.length < 8) {
    throw new Error("--password must be at least 8 characters.");
  }

  return {
    workspace: workspace!,
    email: email!,
    name: name!,
    password,
    role: (roleArg as "ADMIN" | "MEMBER") ?? "ADMIN",
    dryRun,
  };
}

/** A readable-but-strong random password: 18 url-safe chars. */
function generatePassword(): string {
  return randomBytes(18).toString("base64url");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // One account per email address — for a SaaS, an email maps to a single
  // user. (The DB only enforces uniqueness *within* a workspace, so we check
  // globally here.)
  const clash = await prisma.user.findFirst({
    where: { email: args.email },
    select: { id: true, workspace: { select: { name: true } } },
  });
  if (clash) {
    throw new Error(
      `A user with email "${args.email}" already exists (workspace: "${clash.workspace.name}"). Aborting.`,
    );
  }

  const password = args.password ?? generatePassword();
  const generated = args.password === undefined;

  console.log(`${args.dryRun ? "[DRY RUN] " : ""}Provisioning workspace…`);
  console.log(`  Workspace: ${args.workspace}`);
  console.log(`  Admin:     ${args.name} <${args.email}>  [${args.role}]`);

  if (args.dryRun) {
    console.log("\n[DRY RUN] Email is free and args are valid. No changes written.");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Everything in one transaction so a partial workspace can never linger.
  const workspace = await prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.create({ data: { name: args.workspace } });

    await tx.user.create({
      data: {
        workspaceId: ws.id,
        email: args.email,
        name: args.name,
        passwordHash,
        role: args.role,
      },
    });

    await tx.status.createMany({
      data: DEFAULT_STATUSES.map((s) => ({ ...s, workspaceId: ws.id })),
    });
    await tx.priority.createMany({
      data: DEFAULT_PRIORITIES.map((p) => ({ ...p, workspaceId: ws.id })),
    });
    await tx.kanbanStage.createMany({
      data: DEFAULT_KANBAN_STAGES.map((k) => ({ ...k, workspaceId: ws.id })),
    });

    return ws;
  });

  console.log(`\n✔ Created workspace "${workspace.name}" (${workspace.id})`);
  console.log(
    `✔ Seeded ${DEFAULT_STATUSES.length} statuses, ${DEFAULT_PRIORITIES.length} priorities, ${DEFAULT_KANBAN_STAGES.length} kanban stages`,
  );
  console.log("\n─── Login credentials ───");
  console.log(`  Email:    ${args.email}`);
  console.log(`  Password: ${password}`);
  if (generated) {
    console.log("  ⚠ Password was auto-generated — copy it now, it won't be shown again.");
  }
  console.log("─────────────────────────");
}

main()
  .catch((err) => {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
