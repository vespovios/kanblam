-- v0.8.8 — beta feedback. Data-only migration (no schema change):
--   * drop the redundant "Pending" project status
--   * rename the "Backlog" kanban column to "On Hold" and move it third,
--     after "In Progress"
--
-- Applies to every existing workspace. On a fresh database this runs before
-- the seed, when no rows exist yet, so every statement is a harmless no-op
-- and the seed then creates the corrected data.

-- 1. Kanban columns: rename "Backlog" -> "On Hold", reorder so it sits third.
UPDATE "kanban_stages" SET name = 'On Hold', "order" = 3 WHERE name = 'Backlog';
UPDATE "kanban_stages" SET "order" = 2 WHERE name = 'In Progress';

-- 2. Drop the redundant "Pending" project status.
-- 2a. Reassign any project on "Pending" to "Not Started" in the same workspace.
UPDATE "projects" AS p
SET "statusId" = ns.id
FROM "statuses" AS pending, "statuses" AS ns
WHERE p."statusId" = pending.id
  AND pending.name = 'Pending'
  AND ns.name = 'Not Started'
  AND ns."workspaceId" = pending."workspaceId";

-- 2b. Delete the now-unreferenced "Pending" status rows.
DELETE FROM "statuses" WHERE name = 'Pending';

-- 2c. Renumber the remaining statuses so "order" runs 1..6 with no gap.
--     ("Not Started" stays at order 1.)
UPDATE "statuses" SET "order" = 2 WHERE name = 'In Progress';
UPDATE "statuses" SET "order" = 3 WHERE name = 'On Hold';
UPDATE "statuses" SET "order" = 4 WHERE name = 'Delayed';
UPDATE "statuses" SET "order" = 5 WHERE name = 'Completed';
UPDATE "statuses" SET "order" = 6 WHERE name = 'Cancelled';
