"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { createTaskFormSchema, type CreateTaskInput } from "@/lib/validators/task";
import { createRecurringTaskFormSchema } from "@/lib/validators/recurring-task";
import { TagPicker } from "@/components/tags/tag-picker";
import type { TagLite } from "@/components/tags/tag-pill";
import { useCreateTag } from "@/components/tags/use-create-tag";
import { pickDefaultPriorityId } from "@/lib/tasks/defaults";
import { SubtaskTemplateList, type SubtaskTemplateItem } from "@/components/subtasks/subtask-template-list";
import {
  RecurrenceFields,
  type RecurrenceValue,
} from "@/components/recurring/recurrence-fields";
import type { TaskRow } from "./tasks-table";
import { useReadOnly, READ_ONLY_CONTROL_TITLE } from "@/components/billing/read-only-provider";

interface Props {
  projects: { id: string; name: string; code: string }[];
  priorities: { id: string; name: string }[];
  kanbanStages: { id: string; name: string }[];
  members: { id: string; name: string | null; email: string; kind: "HUMAN" | "AGENT" }[];
  /** All workspace tags + usage count, for the TagPicker dropdown. */
  allTags: (TagLite & { _count: { tasks: number } })[];
  /** Current user id — used as the default assignee for new tasks. */
  currentUserId: string;
  /** Optional override of initial form values (e.g., pre-fill kanbanStageId from a column). */
  defaultValues?: Partial<CreateTaskInput>;
  /** Render a default trigger button (+ New task). Set false when the caller supplies its own trigger via `open`/`onOpenChange`. */
  renderTrigger?: boolean;
  /** Controlled open state. When provided, `renderTrigger` should be false. */
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  /** Called with the created task after a successful POST. Not called for
   *  recurring tasks — those create a template, not an immediate task row. */
  onTaskCreated?: (task: TaskRow) => void;
}

export function TaskCreateDialog({
  projects,
  priorities,
  kanbanStages,
  members,
  allTags,
  currentUserId,
  defaultValues,
  renderTrigger = true,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onTaskCreated,
}: Props) {
  const router = useRouter();
  const createTag = useCreateTag();
  const readOnly = useReadOnly();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    controlledOnOpenChange?.(v);
  };
  const [loading, setLoading] = useState(false);
  const [subtasks, setSubtasks] = useState<SubtaskTemplateItem[]>([]);
  // Recurrence is held outside react-hook-form: the rhf form always validates
  // against createTaskFormSchema (the shared + one-off fields). `null` means
  // "Does not repeat" — a normal one-off task. Any non-null value means
  // submit ignores the rhf start/due dates and POSTs a recurring template.
  const [recurrence, setRecurrence] = useState<RecurrenceValue | null>(null);

  const resolvedDefaults: Partial<CreateTaskInput> = {
    projectId: projects[0]?.id ?? "",
    priorityId: pickDefaultPriorityId(priorities),
    kanbanStageId: kanbanStages[0]?.id ?? "",
    assigneeId: currentUserId,
    tagIds: [],
    ...defaultValues,
  };

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<CreateTaskInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createTaskFormSchema) as any,
    defaultValues: resolvedDefaults,
  });

  // Re-apply defaults whenever they change (e.g., different column opens the dialog).
  useEffect(() => {
    if (open) {
      reset(resolvedDefaults);
      setSubtasks([]);
      setRecurrence(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultValues?.kanbanStageId, defaultValues?.projectId, defaultValues?.assigneeId, defaultValues?.tagIds]);

  async function onSubmit(values: CreateTaskInput) {
    setLoading(true);

    // --- Recurring path: create a template, not a one-off task ---
    if (recurrence !== null) {
      const recurringPayload = {
        name: values.name,
        description: values.description,
        projectId: values.projectId,
        priorityId: values.priorityId,
        kanbanStageId: values.kanbanStageId,
        assigneeId: values.assigneeId,
        tagIds: values.tagIds,
        isImportant: values.isImportant,
        isUrgent: values.isUrgent,
        subtaskTemplates: subtasks.map((s) => ({ title: s.title })),
        frequency: recurrence.frequency,
        interval: recurrence.interval,
        daysOfWeek: recurrence.daysOfWeek,
        startDate: recurrence.startDate,
        endDate: recurrence.endDate || undefined,
      };
      const parsed = createRecurringTaskFormSchema.safeParse(recurringPayload);
      if (!parsed.success) {
        setLoading(false);
        toast.error("Check the recurrence settings.");
        return;
      }
      const res = await fetch("/api/recurring-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      setLoading(false);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to create recurring task");
        return;
      }
      toast.success("Recurring task created");
      reset();
      setSubtasks([]);
      setRecurrence(null);
      setOpen(false);
      // The POST route materialises the first batch of instances; refresh so
      // any that land in the current window show up. No onTaskCreated — a
      // template was created, not a specific task row.
      router.refresh();
      return;
    }

    // --- One-off task path ---
    const payload = {
      ...values,
      subtasks: subtasks.map((s) => ({ title: s.title })),
    };
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setLoading(false);
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to create task");
      return;
    }
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    toast.success("Task created");
    reset();
    setOpen(false);
    if (data.task && onTaskCreated) {
      const t = data.task;
      const created: TaskRow = {
        id: t.id,
        name: t.name,
        description: t.description ?? null,
        project: t.project,
        assignee: t.assignee ?? null,
        priority: { id: t.priority.id, name: t.priority.name, color: t.priority.color },
        kanbanStage: { id: t.kanbanStage.id, name: t.kanbanStage.name, color: t.kanbanStage.color, isTerminal: t.kanbanStage.isTerminal },
        tags: t.tags ?? [],
        subtasks: t.subtasks ?? [],
        progressManual: t.progressManual ?? false,
        startDate: t.startDate ? new Date(t.startDate).toISOString() : null,
        dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
        progressPct: t.progressPct,
        recurringTemplateId: t.recurringTemplateId ?? null,
        isImportant: t.isImportant,
        isUrgent: t.isUrgent,
      };
      onTaskCreated(created);
    }
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen} disablePointerDismissal>
      {renderTrigger && (
        <DialogTrigger
          render={
            <Button
              disabled={readOnly}
              title={readOnly ? READ_ONLY_CONTROL_TITLE : undefined}
            >
              + New task
            </Button>
          }
        />
      )}
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {/* Project */}
          <div className="space-y-1">
            <Label className="text-xs">Project</Label>
            <Select value={watch("projectId")} onValueChange={(v) => { if (v) setValue("projectId", v); }}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v: string) => {
                    const match = projects.find((p) => p.id === v);
                    return match ? `${match.code} — ${match.name}` : "Select project";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Name */}
          <div className="space-y-1">
            <Label htmlFor="name" className="text-xs">Name</Label>
            <Input
              id="name"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? "name-error" : undefined}
              {...register("name")}
            />
            {errors.name && (
              <p id="name-error" role="alert" className="text-sm text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          {/* Stage / Priority / Assignee — 3-column row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1 min-w-0">
              <Label className="text-xs">Stage</Label>
              <Select value={watch("kanbanStageId")} onValueChange={(v) => { if (v) setValue("kanbanStageId", v); }}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string) => kanbanStages.find((k) => k.id === v)?.name ?? "Select stage"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {kanbanStages.map((k) => (<SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 min-w-0">
              <Label className="text-xs">Priority</Label>
              <Select value={watch("priorityId")} onValueChange={(v) => { if (v) setValue("priorityId", v); }}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string) => priorities.find((p) => p.id === v)?.name ?? "Select priority"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {priorities.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 min-w-0">
              {/* No "Unassigned" option by design — every task is created with
                  an assignee (defaults to current user). Clearing one is only
                  reachable via the edit drawer. */}
              <Label className="text-xs">Assignee</Label>
              <Select
                value={watch("assigneeId") ?? currentUserId}
                onValueChange={(v) => { if (v) setValue("assigneeId", v); }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string) => {
                      const m = members.find((mm) => mm.id === (v || currentUserId));
                      return m?.name ?? m?.email ?? "Select assignee";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name ?? m.email}
                      {m.kind === "AGENT" && <Badge variant="outline" className="ml-2">Agent</Badge>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Repeat — the "Does not repeat" dropdown default keeps this a
              one-off task with start/due dates; any recurrence preset
              creates a template on submit instead. */}
          <RecurrenceFields value={recurrence} onChange={setRecurrence} />
          {recurrence === null && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="startDate" className="text-xs">Start</Label>
                <Input id="startDate" type="date" {...register("startDate")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dueDate" className="text-xs">Due</Label>
                <Input id="dueDate" type="date" {...register("dueDate")} />
              </div>
            </div>
          )}

          {/* Important / Urgent — inline */}
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                id="important"
                checked={watch("isImportant") ?? false}
                onCheckedChange={(v) => setValue("isImportant", !!v)}
              />
              <span className="text-sm">Important</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                id="urgent"
                checked={watch("isUrgent") ?? false}
                onCheckedChange={(v) => setValue("isUrgent", !!v)}
              />
              <span className="text-sm">Urgent</span>
            </label>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label htmlFor="description" className="text-xs">Description</Label>
            <Textarea id="description" {...register("description")} className="min-h-[60px]" />
          </div>

          {/* Checklist */}
          <div className="space-y-1">
            <Label className="text-xs">Checklist</Label>
            <SubtaskTemplateList items={subtasks} onChange={setSubtasks} />
          </div>

          {/* Tags */}
          <div className="space-y-1">
            <Label className="text-xs">Tags</Label>
            <TagPicker
              allTags={allTags}
              selectedIds={watch("tagIds") ?? []}
              onChange={(ids) => setValue("tagIds", ids)}
              onCreateTag={createTag}
            />
          </div>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline">Cancel</Button>} />
            <Button type="submit" disabled={loading}>
              {loading
                ? "Creating..."
                : recurrence !== null
                  ? "Create recurring task"
                  : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
