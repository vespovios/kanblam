"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Lock, LockOpen, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { updateTaskFormSchema, type UpdateTaskInput } from "@/lib/validators/task";
import { TagPicker } from "@/components/tags/tag-picker";
import type { TagLite } from "@/components/tags/tag-pill";
import { useCreateTag } from "@/components/tags/use-create-tag";
import { SubtaskList } from "@/components/subtasks/subtask-list";
import { TaskComments } from "@/components/comments/task-comments";
import type { SubtaskRowItem } from "@/components/subtasks/subtask-row";
import {
  RecurrenceFields,
  type RecurrenceValue,
} from "@/components/recurring/recurrence-fields";
import {
  RecurringScopeDialog,
  type RecurrenceScope,
} from "@/components/recurring/recurring-scope-dialog";
import type { TaskRow } from "./tasks-table";
import { useReadOnly, READ_ONLY_CONTROL_TITLE } from "@/components/billing/read-only-provider";

interface Props {
  task: TaskRow;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projects: { id: string; name: string; code: string }[];
  priorities: { id: string; name: string }[];
  kanbanStages: { id: string; name: string }[];
  members: { id: string; name: string | null; email: string; kind: "HUMAN" | "AGENT" }[];
  /** All workspace tags + usage count, for the TagPicker dropdown. */
  allTags: (TagLite & { _count: { tasks: number } })[];
  /** Called with the updated task after a successful single-task save.
   *  Not called for series-scoped edits — the task's identity can change
   *  (a "following" split regenerates it), so the caller refreshes instead. */
  onTaskUpdated?: (task: TaskRow) => void;
  /** Called with the deleted task's id after a successful delete. */
  onTaskDeleted?: (id: string) => void;
}

function dateIso(v: string | null): string {
  return v ? new Date(v).toISOString().slice(0, 10) : "";
}

export function TaskEditDrawer({
  task,
  open,
  onOpenChange,
  projects,
  priorities,
  kanbanStages,
  members,
  allTags,
  onTaskUpdated,
  onTaskDeleted,
}: Props) {
  const router = useRouter();
  const createTag = useCreateTag();
  const readOnly = useReadOnly();
  const isRecurring = task.recurringTemplateId !== null;
  const [loading, setLoading] = useState(false);
  const [subtasks, setSubtasks] = useState<SubtaskRowItem[]>(
    task.subtasks.map((s) => ({ id: s.id, title: s.title, completed: s.completed })),
  );
  const [progressManual, setProgressManual] = useState<boolean>(task.progressManual);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  // The linked template's recurrence rule — fetched on open for recurring
  // tasks. null while loading, or for one-off tasks.
  const [recurrence, setRecurrence] = useState<RecurrenceValue | null>(null);
  // When set, the scope prompt is open. `values` is the validated form
  // payload waiting on a scope choice (edit only).
  const [scopePrompt, setScopePrompt] = useState<
    { action: "edit"; values: UpdateTaskInput } | { action: "delete" } | null
  >(null);

  const { register, handleSubmit, setValue, watch, reset, control, formState: { errors } } = useForm<UpdateTaskInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(updateTaskFormSchema) as any,
    defaultValues: {
      projectId: task.project.id,
      name: task.name,
      description: task.description ?? undefined,
      priorityId: task.priority.id,
      kanbanStageId: task.kanbanStage.id,
      assigneeId: task.assignee?.id ?? undefined,
      tagIds: task.tags.map((t) => t.id),
      startDate: dateIso(task.startDate) || undefined,
      dueDate: dateIso(task.dueDate) || undefined,
      isImportant: task.isImportant,
      isUrgent: task.isUrgent,
      progressPct: task.progressPct,
    },
  });

  const prevTaskIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevTaskIdRef.current === task.id) return; // same task, parent just re-rendered — don't reset
    prevTaskIdRef.current = task.id;
    reset({
      projectId: task.project.id,
      name: task.name,
      description: task.description ?? undefined,
      priorityId: task.priority.id,
      kanbanStageId: task.kanbanStage.id,
      assigneeId: task.assignee?.id ?? undefined,
      tagIds: task.tags.map((t) => t.id),
      startDate: dateIso(task.startDate) || undefined,
      dueDate: dateIso(task.dueDate) || undefined,
      isImportant: task.isImportant,
      isUrgent: task.isUrgent,
      progressPct: task.progressPct,
    });
    setSubtasks(task.subtasks.map((s) => ({ id: s.id, title: s.title, completed: s.completed })));
    setProgressManual(task.progressManual);
    setBannerDismissed(false);
    setScopePrompt(null);
  }, [task, reset]);

  // Fetch the linked template's recurrence rule for recurring tasks so the
  // drawer can show + edit the series rule.
  useEffect(() => {
    if (!task.recurringTemplateId) {
      setRecurrence(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/recurring-tasks/${task.recurringTemplateId}`);
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        const t = data?.template;
        if (!t || cancelled) return;
        setRecurrence({
          frequency: t.frequency,
          interval: t.interval,
          daysOfWeek: t.daysOfWeek ?? [],
          startDate: t.startDate ? t.startDate.slice(0, 10) : "",
          endDate: t.endDate ? t.endDate.slice(0, 10) : "",
        });
      } catch {
        // Leave recurrence null — the section just won't render.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [task.id, task.recurringTemplateId]);

  /** Single-task or series-scoped save. */
  async function doSave(values: UpdateTaskInput, scope: RecurrenceScope) {
    setLoading(true);

    // Series-scoped edit — carries the recurrence rule alongside the fields.
    if (scope !== "this") {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          scope,
          recurrence: recurrence
            ? { ...recurrence, endDate: recurrence.endDate || null }
            : undefined,
        }),
      });
      setLoading(false);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to save");
        return;
      }
      toast.success(scope === "all" ? "All tasks updated" : "This and following tasks updated");
      onOpenChange(false);
      router.refresh();
      return;
    }

    // Plain single-task edit.
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      setLoading(false);
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to save");
      return;
    }
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    toast.success("Task updated");
    onOpenChange(false);
    if (data.task && onTaskUpdated) {
      const t = data.task;
      const updated: TaskRow = {
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
      onTaskUpdated(updated);
    }
    router.refresh();
  }

  // Form submit: recurring tasks route through the scope prompt first;
  // one-off tasks save straight away.
  function onSubmit(values: UpdateTaskInput) {
    if (isRecurring) {
      setScopePrompt({ action: "edit", values });
      return;
    }
    doSave(values, "this");
  }

  /** Single-task or series-scoped delete. */
  async function doDelete(scope: RecurrenceScope) {
    setLoading(true);
    const url =
      scope === "this"
        ? `/api/tasks/${task.id}`
        : `/api/tasks/${task.id}?scope=${scope}`;
    const res = await fetch(url, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      toast.error("Failed to delete");
      return;
    }
    toast.success(
      scope === "all"
        ? "All tasks deleted"
        : scope === "following"
          ? "This and following tasks deleted"
          : "Task deleted",
    );
    onOpenChange(false);
    onTaskDeleted?.(task.id);
    router.refresh();
  }

  function onDelete() {
    if (isRecurring) {
      setScopePrompt({ action: "delete" });
      return;
    }
    if (!confirm("Delete this task?")) return;
    doDelete("this");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md w-full overflow-y-auto !gap-0 !p-0">
        <SheetHeader className="border-b !p-3">
          <SheetTitle className="leading-tight">{task.name}</SheetTitle>
          <p className="text-xs text-muted-foreground font-mono">{task.project.code} · {task.project.name}</p>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 p-3">
          {/* Name — same aria-invalid + role="alert" treatment as the
              Create dialog. Without this, clearing the name and clicking
              Save silently fails (validation kicks in, form stays open,
              user has no idea why). Matches the qa#3 / Hermes fix. */}
          <div className="space-y-1">
            <Label htmlFor="name" className="text-xs">Name</Label>
            <Input
              id="name"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? "edit-name-error" : undefined}
              {...register("name")}
            />
            {errors.name && (
              <p id="edit-name-error" role="alert" className="text-sm text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          {/* Project — moving a task here reassigns it to another project.
              Stage, priority, tags and assignee are workspace-scoped, so they
              all carry over unchanged. */}
          <div className="space-y-1">
            <Label className="text-xs">Project</Label>
            <Controller
              control={control}
              name="projectId"
              render={({ field }) => (
                <Select value={field.value ?? ""} onValueChange={(v) => { if (v) field.onChange(v); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v: string) => {
                        const p = projects.find((x) => x.id === v);
                        return p ? `${p.code} · ${p.name}` : "Select project";
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.code} · {p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Stage / Priority / Assignee — 3-column row.
              Controller-wrapped so the value reliably reaches handleSubmit
              for non-native form controls (Select). Plain watch+setValue
              was occasionally dropping the field from the submitted payload. */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1 min-w-0">
              <Label className="text-xs">Stage</Label>
              <Controller
                control={control}
                name="kanbanStageId"
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={(v) => { if (v) field.onChange(v); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v: string) => kanbanStages.find((k) => k.id === v)?.name ?? "Select stage"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {kanbanStages.map((k) => (<SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1 min-w-0">
              <Label className="text-xs">Priority</Label>
              <Controller
                control={control}
                name="priorityId"
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={(v) => { if (v) field.onChange(v); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v: string) => priorities.find((p) => p.id === v)?.name ?? "Select priority"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {priorities.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1 min-w-0">
              <Label className="text-xs">Assignee</Label>
              <Controller
                control={control}
                name="assigneeId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? "__unassigned__"}
                    onValueChange={(v) => field.onChange(v === "__unassigned__" ? null : v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v: string) => {
                          if (!v || v === "__unassigned__") return "Unassigned";
                          const m = members.find((x) => x.id === v);
                          return m ? (m.name ?? m.email) : "Unassigned";
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unassigned__">Unassigned</SelectItem>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name ?? m.email}
                          {m.kind === "AGENT" && <Badge variant="outline">Agent</Badge>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* Important / Urgent — Controller-wrapped so the boolean reaches
              handleSubmit (base-ui Checkbox doesn't register with rhf natively). */}
          <div className="flex gap-6">
            <Controller
              control={control}
              name="isImportant"
              render={({ field }) => (
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    id="edit-important"
                    checked={field.value ?? false}
                    onCheckedChange={(v) => field.onChange(!!v)}
                  />
                  <span className="text-sm">Important</span>
                </label>
              )}
            />
            <Controller
              control={control}
              name="isUrgent"
              render={({ field }) => (
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    id="edit-urgent"
                    checked={field.value ?? false}
                    onCheckedChange={(v) => field.onChange(!!v)}
                  />
                  <span className="text-sm">Urgent</span>
                </label>
              )}
            />
          </div>

          {/* Dates (one-off) OR Recurrence (recurring). A recurring task's
              dates come from the schedule, so the rule replaces the
              instance date inputs. */}
          {isRecurring ? (
            recurrence && (
              <div className="space-y-1">
                <Label className="text-xs">Recurrence</Label>
                <RecurrenceFields
                  allowNone={false}
                  value={recurrence}
                  onChange={setRecurrence}
                />
              </div>
            )
          ) : (
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

          {/* Progress — single-row layout: label/% on left, slider in middle, lock toggle on right */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Label htmlFor="progress" className="text-xs shrink-0 min-w-[80px]">
                Progress <span className="text-muted-foreground font-mono">({watch("progressPct") ?? 0}%)</span>
              </Label>
              <Input
                id="progress"
                type="range"
                min={0}
                max={100}
                step={5}
                value={watch("progressPct") ?? 0}
                disabled={subtasks.length > 0 && !progressManual}
                onChange={(e) => setValue("progressPct", Number(e.target.value))}
                className="flex-1"
              />
              {subtasks.length > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    const next = !progressManual;
                    setProgressManual(next);
                    try {
                      const res = await fetch(`/api/tasks/${task.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ progressManual: next }),
                      });
                      if (!res.ok) {
                        setProgressManual(!next);
                        return;
                      }
                      const data = await res.json().catch(() => null);
                      if (data?.task && next === false) {
                        setValue("progressPct", data.task.progressPct);
                      }
                    } catch (err) {
                      console.error("progressManual toggle failed", err);
                      setProgressManual(!next);
                    }
                  }}
                  aria-label={progressManual ? "Manual progress. Click to link to subtasks." : "Linked to subtasks. Click to set manually."}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
                  title={progressManual ? "Manual progress. Click to link to subtasks." : "Linked to subtasks. Click to set manually."}
                >
                  {progressManual ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />}
                </button>
              )}
            </div>
            {subtasks.length > 0 && progressManual && !bannerDismissed && (
              <div className="flex items-center gap-2 text-xs bg-amber-50 text-amber-900 border border-amber-200 rounded-md px-2 py-1">
                <Lightbulb className="size-3.5 shrink-0" />
                <span className="flex-1">You&apos;ve added subtasks. Link progress to them?</span>
                <button
                  type="button"
                  onClick={async () => {
                    setProgressManual(false);
                    try {
                      const res = await fetch(`/api/tasks/${task.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ progressManual: false }),
                      });
                      if (!res.ok) {
                        setProgressManual(true);
                        return;
                      }
                      const data = await res.json().catch(() => null);
                      if (data?.task) setValue("progressPct", data.task.progressPct);
                    } catch (err) {
                      console.error("Link to subtasks failed", err);
                      setProgressManual(true);
                    }
                  }}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  Link
                </button>
                <button
                  type="button"
                  onClick={() => setBannerDismissed(true)}
                  aria-label="Dismiss"
                  className="hover:text-amber-700"
                >
                  ×
                </button>
              </div>
            )}
          </div>

          {/* Description — Controller-wrapped for the same reason as the
              other non-native controls; the Textarea wrapper component can
              swallow the rhf ref under some React 19 / base-ui combinations. */}
          <div className="space-y-1">
            <Label htmlFor="edit-description" className="text-xs">Description</Label>
            <Controller
              control={control}
              name="description"
              render={({ field }) => (
                <Textarea
                  id="edit-description"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  className="min-h-[60px]"
                />
              )}
            />
          </div>

          {/* Checklist */}
          <div className="space-y-1">
            <Label className="text-xs">Checklist</Label>
            <SubtaskList
              taskId={task.id}
              subtasks={subtasks}
              onChanged={(next) => setSubtasks(next)}
              onMutationApplied={async () => {
                if (progressManual) return;
                try {
                  const res = await fetch(`/api/tasks/${task.id}`);
                  if (res.ok) {
                    const data = await res.json().catch(() => null);
                    if (data?.task) setValue("progressPct", data.task.progressPct);
                  }
                } catch (err) {
                  console.error("progress refresh failed", err);
                }
              }}
            />
          </div>

          {/* Tags — Controller-wrapped so the array reliably reaches handleSubmit. */}
          <div className="space-y-1">
            <Label className="text-xs">Tags</Label>
            <Controller
              control={control}
              name="tagIds"
              render={({ field }) => (
                <TagPicker
                  allTags={allTags}
                  selectedIds={field.value ?? []}
                  onChange={(ids) => field.onChange(ids)}
                  onCreateTag={createTag}
                />
              )}
            />
          </div>

          {/* Comments */}
          <div className="space-y-1">
            <Label className="text-xs">Comments</Label>
            <TaskComments taskId={task.id} readOnly={readOnly} />
          </div>

          {/* Footer */}
          <div className="flex justify-between pt-3 border-t -mx-3 px-3">
            <Button
              type="button"
              variant="outline"
              className="text-destructive"
              onClick={onDelete}
              disabled={loading || readOnly}
              title={readOnly ? READ_ONLY_CONTROL_TITLE : undefined}
            >
              Delete
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                type="submit"
                disabled={loading || readOnly}
                title={readOnly ? READ_ONLY_CONTROL_TITLE : undefined}
              >
                {loading ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>

      {/* Scope prompt for recurring tasks — gates Save / Delete behind a
          "This task / This and following / All tasks" choice. */}
      <RecurringScopeDialog
        open={scopePrompt !== null}
        action={scopePrompt?.action ?? "edit"}
        onOpenChange={(v) => {
          if (!v) setScopePrompt(null);
        }}
        onConfirm={(scope) => {
          if (!scopePrompt) return;
          if (scopePrompt.action === "edit") doSave(scopePrompt.values, scope);
          else doDelete(scope);
        }}
      />
    </Sheet>
  );
}
