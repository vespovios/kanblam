-- Add workspace-scoped Tag table + implicit M2M join tables for Task and RecurringTaskTemplate.

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tags_workspaceId_idx" ON "tags"("workspaceId");
CREATE UNIQUE INDEX "tags_workspaceId_name_key" ON "tags"("workspaceId", "name");

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: Tag <-> Task M2M (Prisma implicit join)
CREATE TABLE "_TagToTask" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_TagToTask_AB_pkey" PRIMARY KEY ("A","B")
);
CREATE INDEX "_TagToTask_B_index" ON "_TagToTask"("B");
ALTER TABLE "_TagToTask" ADD CONSTRAINT "_TagToTask_A_fkey" FOREIGN KEY ("A") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_TagToTask" ADD CONSTRAINT "_TagToTask_B_fkey" FOREIGN KEY ("B") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: Tag <-> RecurringTaskTemplate M2M
CREATE TABLE "_RecurringTaskTemplateToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_RecurringTaskTemplateToTag_AB_pkey" PRIMARY KEY ("A","B")
);
CREATE INDEX "_RecurringTaskTemplateToTag_B_index" ON "_RecurringTaskTemplateToTag"("B");
ALTER TABLE "_RecurringTaskTemplateToTag" ADD CONSTRAINT "_RecurringTaskTemplateToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "recurring_task_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_RecurringTaskTemplateToTag" ADD CONSTRAINT "_RecurringTaskTemplateToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
