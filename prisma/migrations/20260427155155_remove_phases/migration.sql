-- Remove the half-built Phases feature.
-- Backend was wired (FKs on Task + RecurringTaskTemplate) but no UI ever
-- assigned tasks to phases. Decision: simpler model > unused dimension.

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_phaseId_fkey";
ALTER TABLE "recurring_task_templates" DROP CONSTRAINT "recurring_task_templates_phaseId_fkey";

-- AlterTable
ALTER TABLE "tasks" DROP COLUMN "phaseId";
ALTER TABLE "recurring_task_templates" DROP COLUMN "phaseId";

-- DropTable
DROP TABLE "phases";
