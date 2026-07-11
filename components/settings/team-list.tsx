import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatShortDate } from "@/lib/dates/format";
import { PendingInvitesTable } from "./pending-invites-table";

interface Member {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "MEMBER";
  kind: "HUMAN" | "AGENT";
  createdAt: Date;
}

interface TeamListProps {
  members: Member[];
  pendingInvites: { id: string; email: string; expiresAt: Date }[];
}

export function TeamList({ members, pendingInvites }: TeamListProps) {
  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-semibold mb-3">Team members</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  {m.name ?? "—"}
                  {m.kind === "AGENT" && (
                    <Badge variant="outline" className="ml-2">Agent</Badge>
                  )}
                </TableCell>
                <TableCell>{m.kind === "AGENT" ? "—" : m.email}</TableCell>
                <TableCell>{m.role}</TableCell>
                <TableCell>{formatShortDate(m.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {pendingInvites.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-3">Pending invites</h3>
          <PendingInvitesTable invites={pendingInvites} />
        </section>
      )}
    </div>
  );
}
