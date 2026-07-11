import { PrismaClient } from "@prisma/client";

const DEFAULT_STATUSES = [
  { name: "Not Started", color: "#9ca3af", order: 1 },
  { name: "In Progress", color: "#3b82f6", order: 2 },
  { name: "Completed", color: "#10b981", order: 3 },
];

const DEFAULT_PRIORITIES = [
  { name: "High", color: "#f97316", order: 1 },
  { name: "Medium", color: "#f59e0b", order: 2 },
  { name: "Low", color: "#3b82f6", order: 3 },
];

const DEFAULT_KANBAN_STAGES = [
  { name: "Backlog", color: "#f5e8e4", order: 1, isTerminal: false },
  { name: "In Progress", color: "#e8f0dc", order: 2, isTerminal: false },
  { name: "Done", color: "#d1fae5", order: 3, isTerminal: true },
];

export interface SeededWorkspace {
  workspaceId: string;
  adminId: string;
  memberId: string;
  statusIds: { notStarted: string; inProgress: string; completed: string };
  priorityIds: { high: string; medium: string; low: string };
  kanbanStageIds: { backlog: string; inProgress: string; done: string };
}

/**
 * Wipes all tenant-scoped data and seeds a fresh workspace + 1 admin + 1 member
 * + 3 statuses + 3 priorities + 3 kanban stages. Returns IDs for tests.
 */
export async function setupTestWorkspace(prisma: PrismaClient): Promise<SeededWorkspace> {
  // Clean slate — respects FK order
  await prisma.subtask.deleteMany();
  await prisma.subtaskTemplate.deleteMany();
  await prisma.task.deleteMany();
  await prisma.recurringTaskTemplate.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.project.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.user.deleteMany();
  await prisma.status.deleteMany();
  await prisma.priority.deleteMany();
  await prisma.kanbanStage.deleteMany();
  await prisma.workspace.deleteMany();

  const ws = await prisma.workspace.create({ data: { name: "TestWS" } });

  const admin = await prisma.user.create({
    data: { workspaceId: ws.id, email: "admin@test.local", role: "ADMIN", name: "Admin" },
  });
  const member = await prisma.user.create({
    data: { workspaceId: ws.id, email: "member@test.local", role: "MEMBER", name: "Member" },
  });

  const makeStatus = (s: (typeof DEFAULT_STATUSES)[number]) =>
    prisma.status.create({ data: { ...s, workspaceId: ws.id } });
  const makePriority = (p: (typeof DEFAULT_PRIORITIES)[number]) =>
    prisma.priority.create({ data: { ...p, workspaceId: ws.id } });
  const makeStage = (k: (typeof DEFAULT_KANBAN_STAGES)[number]) =>
    prisma.kanbanStage.create({ data: { ...k, workspaceId: ws.id } });

  const [notStarted, inProgressStatus, completed] = await Promise.all(DEFAULT_STATUSES.map(makeStatus));
  const [high, medium, low] = await Promise.all(DEFAULT_PRIORITIES.map(makePriority));
  const [backlog, inProgressStage, done] = await Promise.all(DEFAULT_KANBAN_STAGES.map(makeStage));

  return {
    workspaceId: ws.id,
    adminId: admin.id,
    memberId: member.id,
    statusIds: {
      notStarted: notStarted.id,
      inProgress: inProgressStatus.id,
      completed: completed.id,
    },
    priorityIds: { high: high.id, medium: medium.id, low: low.id },
    kanbanStageIds: {
      backlog: backlog.id,
      inProgress: inProgressStage.id,
      done: done.id,
    },
  };
}
