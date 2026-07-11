"use client";

import { Popover } from "@base-ui/react/popover";
import { CalendarDayPill } from "./calendar-day-pill";
import type { CalendarTask } from "./calendar-board";

interface Props {
  date: Date;
  overflowCount: number;
  allTasks: CalendarTask[];
  onTaskClick: (task: CalendarTask) => void;
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function DayOverflowPopover({ date, overflowCount, allTasks, onTaskClick }: Props) {
  const label = `${MONTH_SHORT[date.getUTCMonth()]} ${date.getUTCDate()}`;
  return (
    <Popover.Root>
      <Popover.Trigger
        className="text-[10px] text-muted-foreground hover:text-foreground hover:underline px-1.5 cursor-pointer text-left"
        onClick={(e) => e.stopPropagation()}
      >
        + {overflowCount} more
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="isolate z-50" side="bottom" align="start" sideOffset={4}>
          <Popover.Popup
            className="rounded-md border bg-card shadow-lg p-2 max-w-[260px] max-h-[60vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xs font-medium mb-1.5 px-1">{label}</div>
            <div className="flex flex-col gap-1">
              {allTasks.map((task) => (
                <CalendarDayPill key={task.id} task={task} onClick={() => onTaskClick(task)} />
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
