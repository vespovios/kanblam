-- Backfill legacy null assignees to the oldest ADMIN of each task's workspace.
-- Idempotent: WHERE clause matches no rows on subsequent applies.
-- If a workspace has no ADMIN user (theoretical), the subquery returns NULL
-- and that workspace's null-assignee tasks remain null. The app layer
-- (POST /api/tasks default + quick-add resolver default) prevents new
-- nulls from being created.
UPDATE tasks t
SET "assigneeId" = (
  SELECT u.id
  FROM users u
  WHERE u."workspaceId" = t."workspaceId"
    AND u.role = 'ADMIN'
  ORDER BY u."createdAt" ASC
  LIMIT 1
)
WHERE t."assigneeId" IS NULL;
