import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { TagPill } from "@/components/tags/tag-pill";
import { TaskGlyphs } from "./task-glyphs";
import { formatShortDate } from "@/lib/dates/format";
import type { KanbanTaskCard } from "@/components/kanban/kanban-card";

/**
 * Shared visual body for the vertical card surfaces: KanbanCard (sortable
 * + overlay) and EisenhowerCard (draggable + overlay). The two were
 * line-by-line identical; consolidating here so the palette and layout
 * cannot drift between them.
 *
 * NOT used by TasksTable row or TodayTaskRow — those have fundamentally
 * different layouts (table cells, dense single-line). The glyph row is
 * shared via <TaskGlyphs> instead.
 */
export function TaskCardBody({ task }: { task: KanbanTaskCard }) {
  return (
    <>
      <div className="flex items-start gap-2 pr-5">
        <TaskGlyphs
          isImportant={task.isImportant}
          isUrgent={task.isUrgent}
          recurringTemplateId={task.recurringTemplateId}
        />
        <span title={task.name} className="text-sm font-medium leading-tight flex-1">{task.name}</span>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-baseline gap-1.5 min-w-0 flex-1">
          <span className="font-mono shrink-0">{task.project.code}</span>
          <span className="truncate">— {task.project.name}</span>
        </span>
        {task.dueDate && <span className="shrink-0">{formatShortDate(task.dueDate)}</span>}
      </div>
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.tags.map((t) => (
            <TagPill key={t.id} tag={t} />
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <Badge style={{ background: `${task.priority.color}22`, color: task.priority.color }}>
          {task.priority.name}
        </Badge>
        {task.assignee && (
          <span className="text-xs text-muted-foreground truncate max-w-[8rem]">
            {task.assignee.name ?? task.assignee.email}
          </span>
        )}
      </div>
      <ProgressBar
        value={task.progressPct}
        size="sm"
        showLabel={false}
        caption={
          task.subtaskTotal > 0 && !task.progressManual
            ? `${task.subtaskCompleted}/${task.subtaskTotal}`
            : undefined
        }
        aria-label={`${task.name} progress`}
      />
    </>
  );
}
