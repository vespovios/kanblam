import { Badge } from "@/components/ui/badge";

export function TaskPriorityBadge({ name, color }: { name: string; color: string }) {
  return <Badge style={{ background: `${color}22`, color }}>{name}</Badge>;
}
