import Link from "next/link";
import { TagPill } from "@/components/tags/tag-pill";
import { TaskPriorityBadge } from "@/components/tasks/task-priority-badge";
import type { TodayTaskRow as TaskShape } from "@/lib/tasks/today";

interface Props {
  task: TaskShape;
  /** Controls due-date badge color: 'overdue' renders red, 'normal' renders muted. */
  variant: "overdue" | "normal";
}

function formatShortDate(d: Date): string {
  const SHORT_MONTH = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${SHORT_MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function TodayTaskRow({ task, variant }: Props) {
  const subtaskTotal = task.subtasks.length;
  const subtaskCompleted = task.subtasks.filter((s) => s.completed).length;
  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const dueClass =
    variant === "overdue" ? "text-destructive" : "text-muted-foreground";

  return (
    <div className="flex items-center gap-3 px-3 py-2 text-sm">
      <Link
        href={`/tasks?taskId=${task.id}`}
        className="flex items-baseline gap-2 min-w-0 flex-1 hover:underline"
      >
        <span className="font-mono text-xs text-muted-foreground shrink-0">
          {task.project.code}
        </span>
        <span className="truncate">{task.name}</span>
      </Link>
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 shrink-0">
          {task.tags.map((t) => (
            <TagPill key={t.id} tag={t} />
          ))}
        </div>
      )}
      {subtaskTotal > 0 && (
        <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
          {subtaskCompleted}/{subtaskTotal}
        </span>
      )}
      <TaskPriorityBadge name={task.priority.name} color={task.priority.color} />
      {dueDate && (
        <span className={`text-xs shrink-0 tabular-nums ${dueClass}`}>
          {formatShortDate(dueDate)}
        </span>
      )}
    </div>
  );
}
