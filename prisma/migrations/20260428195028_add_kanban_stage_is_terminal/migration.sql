-- Add isTerminal flag to KanbanStage and backfill from seeded "Done" name.
-- Safe because no workspace has customized KanbanStage seeds (no admin UI).

ALTER TABLE "kanban_stages" ADD COLUMN "isTerminal" BOOLEAN NOT NULL DEFAULT false;

UPDATE "kanban_stages" SET "isTerminal" = true WHERE "name" = 'Done';
