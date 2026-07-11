"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatShortDate } from "@/lib/dates/format";

interface Invite {
  id: string;
  email: string;
  expiresAt: Date;
}

interface Props {
  invites: Invite[];
}

/** Pending-invites table with per-row Cancel button. Hits
 *  DELETE /api/invite/[id] then router.refresh — the realtime "members"
 *  notify keeps multi-tab/multi-session views in sync. */
export function PendingInvitesTable({ invites }: Props) {
  const router = useRouter();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  async function cancel(id: string) {
    setCancellingId(id);
    const res = await fetch(`/api/invite/${id}`, { method: "DELETE" });
    setCancellingId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error ?? "Failed to cancel invite");
      return;
    }
    toast.success("Invite cancelled");
    router.refresh();
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead className="w-12" aria-label="Cancel" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {invites.map((inv) => (
          <TableRow key={inv.id}>
            <TableCell>{inv.email}</TableCell>
            <TableCell>{formatShortDate(inv.expiresAt)}</TableCell>
            <TableCell className="text-right">
              <button
                type="button"
                onClick={() => cancel(inv.id)}
                disabled={cancellingId === inv.id}
                aria-label={`Cancel invite for ${inv.email}`}
                title="Cancel invite"
                className="inline-flex items-center justify-center size-7 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X className="size-4" />
              </button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
