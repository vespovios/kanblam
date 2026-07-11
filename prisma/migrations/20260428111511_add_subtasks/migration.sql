-- Add Subtask + SubtaskTemplate tables and Task.progressManual flag.

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "progressManual" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "subtasks" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subtasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subtasks_taskId_position_idx" ON "subtasks"("taskId", "position");

ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "subtask_templates" (
    "id" TEXT NOT NULL,
    "recurringTemplateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subtask_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subtask_templates_recurringTemplateId_position_idx" ON "subtask_templates"("recurringTemplateId", "position");

ALTER TABLE "subtask_templates" ADD CONSTRAINT "subtask_templates_recurringTemplateId_fkey" FOREIGN KEY ("recurringTemplateId") REFERENCES "recurring_task_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
