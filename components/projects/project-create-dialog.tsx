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
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createProjectFormSchema, type CreateProjectInput } from "@/lib/validators/project";
import { useReadOnly, READ_ONLY_CONTROL_TITLE } from "@/components/billing/read-only-provider";

interface Props {
  statuses: { id: string; name: string; color: string }[];
  members: { id: string; name: string | null; email: string; kind: "HUMAN" | "AGENT" }[];
}

export function ProjectCreateDialog({ statuses, members }: Props) {
  const router = useRouter();
  const readOnly = useReadOnly();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateProjectInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createProjectFormSchema) as any,
    defaultValues: { statusId: statuses[0]?.id ?? "" },
  });

  async function onSubmit(values: CreateProjectInput) {
    setLoading(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to create project");
      return;
    }
    toast.success(`Project created`);
    reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            disabled={readOnly}
            title={readOnly ? READ_ONLY_CONTROL_TITLE : undefined}
          >
            + New project
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="code">Code</Label>
            <Input id="code" placeholder="P01" {...register("code")} />
            {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="clientName">Client (optional)</Label>
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
            <Label>Project lead (optional)</Label>
            <Select
              value={watch("projectLeadId") ?? ""}
              onValueChange={(v) => setValue("projectLeadId", v ?? undefined)}
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
                  <SelectItem key={m.id} value={m.id}>
                    {m.name ?? m.email}
                    {m.kind === "AGENT" && <Badge variant="outline">Agent</Badge>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start date</Label>
              <Input id="startDate" type="date" {...register("startDate")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End date</Label>
              <Input id="endDate" type="date" {...register("endDate")} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline">Cancel</Button>} />
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
