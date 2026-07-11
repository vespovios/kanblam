"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ProjectStatusBadge } from "./project-status-badge";
import { formatShortDate } from "@/lib/dates/format";

interface Project {
  id: string;
  name: string;
  code: string;
  clientName: string | null;
  startDate: Date | null;
  endDate: Date | null;
  status: { name: string; color: string };
  projectLead: { name: string | null; email: string; kind: "HUMAN" | "AGENT" } | null;
  _count: { tasks: number };
}

export function ProjectsList({ projects }: { projects: Project[] }) {
  const router = useRouter();

  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground">No projects yet. Create your first one above.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>Lead</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Dates</TableHead>
          <TableHead>Tasks</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((p) => (
          // Whole row clickable, mirroring the TasksTable UX. The <Link>
          // in the Name column survives for keyboard nav (tab to it +
          // Enter) and right-click "open in new tab".
          <TableRow
            key={p.id}
            className="cursor-pointer"
            onClick={() => router.push(`/projects/${p.id}`)}
          >
            <TableCell className="font-mono text-xs">{p.code}</TableCell>
            <TableCell>
              <Link
                href={`/projects/${p.id}`}
                className="font-medium hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {p.name}
              </Link>
            </TableCell>
            <TableCell>{p.clientName ?? "—"}</TableCell>
            <TableCell>
              {p.projectLead?.name ?? p.projectLead?.email ?? "—"}
              {p.projectLead?.kind === "AGENT" && (
                <Badge variant="outline" className="ml-1.5">Agent</Badge>
              )}
            </TableCell>
            <TableCell>
              <ProjectStatusBadge status={p.status} />
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {formatShortDate(p.startDate)}
              {" → "}
              {formatShortDate(p.endDate)}
            </TableCell>
            <TableCell>{p._count.tasks}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
