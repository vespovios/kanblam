import { Badge } from "@/components/ui/badge";

interface Props {
  status: { name: string; color: string };
}

export function ProjectStatusBadge({ status }: Props) {
  return (
    <Badge style={{ background: `${status.color}20`, color: status.color }}>
      {status.name}
    </Badge>
  );
}
