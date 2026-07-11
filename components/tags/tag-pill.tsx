import { tagTextColor } from "@/lib/tags/color";

export interface TagLite {
  id: string;
  name: string;
  color: string;
}

interface Props {
  tag: TagLite;
  /** Show as compact (smaller padding) — for table cells. */
  compact?: boolean;
}

export function TagPill({ tag, compact = false }: Props) {
  const text = tagTextColor(tag.name);
  return (
    <span
      style={{ background: tag.color, color: text }}
      className={
        compact
          ? "inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium"
          : "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      }
    >
      {tag.name}
    </span>
  );
}
