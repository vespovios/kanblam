/**
 * One-shot data migration: remove the "Pending" and "On Hold" KanbanStage
 * rows from every workspace. Tasks currently sitting in those stages are
 * reassigned to "Backlog" (or, if Backlog is missing for a workspace,
 * the lowest-order non-terminal stage). Remaining stages are renumbered
 * contiguously starting at order=1.
 *
 * Idempotent — running it twice is a no-op after the first run.
 *
 * Run:
 *   npx tsx scripts/cleanup-kanban-stages.ts
 *
 * For dry-run preview (counts only, no writes):
 *   DRY_RUN=true npx tsx scripts/cleanup-kanban-stages.ts
 *
 * The dev database URL is picked up from .env automatically. To run
 * against a different DB:
 *   DATABASE_URL=postgresql://... npx tsx scripts/cleanup-kanban-stages.ts
 */

import { PrismaClient } from "@prisma/client";

const DOOMED_STAGE_NAMES = ["Pending", "On Hold"] as const;
const TARGET_STAGE_NAME = "Backlog";

const prisma = new PrismaClient();
const dryRun = process.env.DRY_RUN === "true";

async function main() {
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (workspaces.length === 0) {
    console.log("No workspaces found. Nothing to do.");
    return;
  }

  console.log(
    `${dryRun ? "[DRY RUN] " : ""}Found ${workspaces.length} workspace(s). Processing…\n`,
  );

  let totalReassigned = 0;
  let totalDeleted = 0;
  let totalRenumbered = 0;

  for (const ws of workspaces) {
    console.log(`Workspace: ${ws.name} (${ws.id})`);

    const stages = await prisma.kanbanStage.findMany({
      where: { workspaceId: ws.id },
      orderBy: { order: "asc" },
    });

    const doomed = stages.filter((s) => DOOMED_STAGE_NAMES.includes(s.name as (typeof DOOMED_STAGE_NAMES)[number]));
    if (doomed.length === 0) {
      console.log("  ✓ Already clean — no Pending/On Hold stages.\n");
      continue;
    }

    // Pick the destination. Prefer "Backlog"; fall back to the lowest-order
    // non-terminal stage that isn't one of the doomed ones.
    const target =
      stages.find((s) => s.name === TARGET_STAGE_NAME) ??
      stages.find(
        (s) =>
          !s.isTerminal &&
          !DOOMED_STAGE_NAMES.includes(s.name as (typeof DOOMED_STAGE_NAMES)[number]),
      );

    if (!target) {
      console.warn(
        `  ⚠ No destination stage found (Backlog missing, no other non-terminal). Skipping workspace.`,
      );
      continue;
    }

    const doomedIds = doomed.map((d) => d.id);
    const reassignCount = await prisma.task.count({
      where: { workspaceId: ws.id, kanbanStageId: { in: doomedIds } },
    });
    console.log(
      `  • ${doomed.length} stage(s) to drop: ${doomed.map((d) => d.name).join(", ")}`,
    );
    console.log(`  • ${reassignCount} task(s) will move to "${target.name}"`);

    if (!dryRun) {
      // Reassign tasks to the destination stage in one bulk update.
      const moved = await prisma.task.updateMany({
        where: { workspaceId: ws.id, kanbanStageId: { in: doomedIds } },
        data: { kanbanStageId: target.id },
      });
      totalReassigned += moved.count;

      // Recurring task templates may also reference these stages — check.
      const templatesMoved = await prisma.recurringTaskTemplate.updateMany({
        where: { workspaceId: ws.id, kanbanStageId: { in: doomedIds } },
        data: { kanbanStageId: target.id },
      });
      if (templatesMoved.count > 0) {
        console.log(`  • Moved ${templatesMoved.count} recurring template(s) too`);
      }

      const removed = await prisma.kanbanStage.deleteMany({
        where: { id: { in: doomedIds } },
      });
      totalDeleted += removed.count;

      // Renumber remaining stages 1..N to keep `order` contiguous. Use a
      // two-pass approach (bump existing orders into a safe-high range
      // first) so we don't trip the (workspaceId, order) unique constraint
      // mid-update if any of the new positions collide with current ones.
      // The schema doesn't actually have a unique on (workspaceId, order)
      // today, but the precaution is cheap and future-proofs the script.
      const remaining = await prisma.kanbanStage.findMany({
        where: { workspaceId: ws.id },
        orderBy: { order: "asc" },
      });
      for (let i = 0; i < remaining.length; i++) {
        await prisma.kanbanStage.update({
          where: { id: remaining[i].id },
          data: { order: 10_000 + i },
        });
      }
      for (let i = 0; i < remaining.length; i++) {
        await prisma.kanbanStage.update({
          where: { id: remaining[i].id },
          data: { order: i + 1 },
        });
      }
      totalRenumbered += remaining.length;
      console.log(`  • Renumbered ${remaining.length} remaining stage(s)\n`);
    } else {
      console.log(`  (dry run — no writes)\n`);
    }
  }

  console.log("Summary");
  console.log("-------");
  if (dryRun) {
    console.log("DRY RUN — no changes were made. Re-run without DRY_RUN=true to apply.");
  } else {
    console.log(`Tasks reassigned: ${totalReassigned}`);
    console.log(`Stages deleted:   ${totalDeleted}`);
    console.log(`Stages renumbered: ${totalRenumbered}`);
  }
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
