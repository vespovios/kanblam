-- Drop Task.statusId and RecurringTaskTemplate.statusId. Status model survives
-- for Project only.

ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_statusId_fkey";
ALTER TABLE "tasks" DROP COLUMN "statusId";

ALTER TABLE "recurring_task_templates" DROP CONSTRAINT IF EXISTS "recurring_task_templates_statusId_fkey";
ALTER TABLE "recurring_task_templates" DROP COLUMN "statusId";
