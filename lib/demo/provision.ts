/**
 * Demo-tenant provisioning for try.kanblam.com (DEMO_MODE deployments).
 * Mirrors scripts/create-workspace.ts: workspace + admin user + default
 * statuses/priorities/stages in one transaction, then the Stratos-1 seed.
 * If seeding fails the workspace is deleted again (cascade) so a broken
 * half-demo never lingers.
 */

import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import {
  DEFAULT_STATUSES,
  DEFAULT_PRIORITIES,
  DEFAULT_KANBAN_STAGES,
} from "@/prisma/seedWorkspace";
import { AGENT_EMAIL_DOMAIN } from "@/lib/validators/agent-member";
import { generatePetname } from "./petname";
import { seedStratosData } from "./seed-stratos";

export const DEMO_WORKSPACE_NAME = "Stratos-1 Mission Control";
/** Demo emails live on a domain we control and never send to. */
const DEMO_EMAIL_DOMAIN = "demo.kanblam.com";

export interface DemoCredentials {
  email: string;
  password: string;
  workspaceId: string;
  displayName: string;
}

export async function provisionDemoWorkspace(): Promise<DemoCredentials> {
  // Petname collisions are rare; the unique-email constraint is the backstop.
  let petname = generatePetname();
  for (let attempt = 0; attempt < 3; attempt++) {
    const email = `${petname.slug}@${DEMO_EMAIL_DOMAIN}`;
    const clash = await prisma.user.findFirst({ where: { email }, select: { id: true } });
    if (!clash) break;
    petname = generatePetname();
  }
  const email = `${petname.slug}@${DEMO_EMAIL_DOMAIN}`;

  // Random per-demo password. It's returned to the visitor's browser once
  // (for the automatic sign-in) — demo tenants hold only sample data and
  // are reaped within DEMO_TTL_HOURS.
  const password = randomBytes(12).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 10);

  const { workspaceId, userId, agentId } = await prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.create({
      data: { name: DEMO_WORKSPACE_NAME, isDemo: true },
    });
    const user = await tx.user.create({
      data: {
        workspaceId: ws.id,
        email,
        name: petname.display,
        passwordHash,
        role: "ADMIN",
      },
    });
    // Flight Computer: a demo agent member so visitors see Agent Members in
    // the seeded workspace. Created directly on the tx (not via
    // createAgentMember, which uses the module-level prisma client and
    // would run outside this transaction) — mirrors the admin user above.
    const agent = await tx.user.create({
      data: {
        workspaceId: ws.id,
        email: `agent-${randomUUID()}@${AGENT_EMAIL_DOMAIN}`,
        name: "Flight Computer",
        kind: "AGENT",
        role: "MEMBER",
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
    return { workspaceId: ws.id, userId: user.id, agentId: agent.id };
  });

  try {
    await seedStratosData(workspaceId, userId, agentId);
  } catch (err) {
    // Roll the whole tenant back — cascade removes user, projects, tasks…
    await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    throw err;
  }

  return { email, password, workspaceId, displayName: petname.display };
}
