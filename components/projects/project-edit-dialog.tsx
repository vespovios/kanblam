"use client";

import { useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateProjectFormSchema, type UpdateProjectInput } from "@/lib/validators/project";
import { useReadOnly, READ_ONLY_CONTROL_TITLE } from "@/components/billing/read-only-provider";

interface Props {
  project: {
    id: string;
    name: string;
    code: string;
    clientName: string | null;
    statusId: string;
    projectLeadId: string | null;
    startDate: Date | null;
    endDate: Date | null;
  };
  statuses: { id: string; name: string }[];
  members: { id: string; name: string | null; email: string }[];
}

function isoOrEmpty(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

export function ProjectEditDialog({ project, statuses, members }: Props) {
  const router = useRouter();
  const readOnly = useReadOnly();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, setValue, watch } = useForm<UpdateProjectInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(updateProjectFormSchema) as any,
    defaultValues: {
      name: project.name,
      code: project.code,
      statusId: project.statusId,
      projectLeadId: project.projectLeadId ?? undefined,
      clientName: project.clientName ?? undefined,
      startDate: isoOrEmpty(project.startDate) || undefined,
      endDate: isoOrEmpty(project.endDate) || undefined,
    },
  });

  async function onSubmit(values: UpdateProjectInput) {
    setLoading(true);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to update");
      return;
    }
    toast.success("Project updated");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            disabled={readOnly}
            title={readOnly ? READ_ONLY_CONTROL_TITLE : undefined}
          >
            Edit
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="code">Code</Label>
            <Input id="code" {...register("code")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clientName">Client</Label>
            <Input id="clientName" {...register("clientName")} />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={watch("statusId")} onValueChange={(v) => { if (v) setValue("statusId", v); }}>
              <SelectTrigger>
                <SelectValue>
                  {(v: string) => statuses.find((s) => s.id === v)?.name ?? "Select status"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Project lead</Label>
            <Select
              value={watch("projectLeadId") ?? ""}
              onValueChange={(v) => setValue("projectLeadId", v ?? null)}
            >
              <SelectTrigger>
                <SelectValue>
                  {(v: string) => {
                    if (!v) return "None";
                    return members.find((m) => m.id === v)?.name ?? members.find((m) => m.id === v)?.email ?? "None";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name ?? m.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start</Label>
              <Input id="startDate" type="date" {...register("startDate")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End</Label>
              <Input id="endDate" type="date" {...register("endDate")} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline">Cancel</Button>} />
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
