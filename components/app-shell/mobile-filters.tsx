"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Check, Filter, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { TagPill } from "@/components/tags/tag-pill";
import { QUADRANT_IDS, QUADRANT_META, type QuadrantId } from "@/lib/eisenhower/quadrants";
import { cn } from "@/lib/utils";

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface Project {
  id: string;
  name: string;
  code: string;
}

interface Member {
  id: string;
  name: string | null;
  email: string;
}

interface Props {
  projects: Project[];
  members: Member[];
  allTags: Tag[];
}

/** Mobile filters bottom sheet. Self-contained inline option lists —
 *  no nested popovers. Each section renders its options as tappable rows
 *  with a check glyph when selected (single-select sections) or a
 *  checkbox (multi-select Tags). All five filter dimensions write to the
 *  same URL params as the desktop GlobalFilters, so the two views stay in
 *  sync via shared URL state. */
export function MobileFilters({ projects, members, allTags }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const projectId = sp.get("projectId");
  const assigneeId = sp.get("assigneeId");
  const quadrant = sp.get("quadrant");
  const tagIds = useMemo(
    () => (sp.get("tags") ?? "").split(",").filter(Boolean),
    [sp],
  );
  const hideCompleted = sp.get("hideCompleted") === "true";

  const activeCount =
    (projectId ? 1 : 0) +
    (assigneeId ? 1 : 0) +
    (quadrant ? 1 : 0) +
    (tagIds.length > 0 ? 1 : 0) +
    (hideCompleted ? 1 : 0);

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(sp);
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleTag(id: string) {
    const next = tagIds.includes(id)
      ? tagIds.filter((x) => x !== id)
      : [...tagIds, id];
    const params = new URLSearchParams(sp);
    if (next.length > 0) params.set("tags", next.join(","));
    else params.delete("tags");
    router.push(`${pathname}?${params.toString()}`);
  }

  function resetAll() {
    const params = new URLSearchParams(sp);
    ["projectId", "assigneeId", "quadrant", "tags", "hideCompleted"].forEach((k) =>
      params.delete(k),
    );
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            aria-label={`Filters${activeCount > 0 ? ` (${activeCount} active)` : ""}`}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold whitespace-nowrap shadow-sm bg-primary text-primary-foreground hover:brightness-110 transition-[filter] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--header-bg)]"
          >
            <Filter className="size-3.5" />
            <span>Filters</span>
            {activeCount > 0 && (
              <span
                aria-hidden="true"
                className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary-foreground text-primary text-[10px] font-bold tabular-nums"
              >
                {activeCount}
              </span>
            )}
          </button>
        }
      />
      <SheetContent
        side="bottom"
        className="max-h-[85vh] rounded-t-xl"
        showCloseButton={false}
      >
        <SheetHeader className="flex flex-row items-center justify-between border-b">
          <SheetTitle>Filters</SheetTitle>
          <div className="flex items-center gap-1">
            {activeCount > 0 && (
              <button
                type="button"
                onClick={resetAll}
                className="text-xs font-medium text-primary hover:underline px-2 py-1"
              >
                Reset
              </button>
            )}
            <SheetClose
              render={
                <button
                  type="button"
                  aria-label="Close filters"
                  className="inline-flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-4" />
                </button>
              }
            />
          </div>
        </SheetHeader>

        <div className="overflow-y-auto px-4 pb-6 space-y-6">
          {/* Project */}
          <FilterSection label="Project">
            <RadioRow
              selected={!projectId}
              onClick={() => setParam("projectId", null)}
              label="All projects"
            />
            {projects.map((p) => (
              <RadioRow
                key={p.id}
                selected={projectId === p.id}
                onClick={() => setParam("projectId", p.id)}
              >
                <span className="font-mono text-xs text-muted-foreground mr-1.5">{p.code}</span>
                {p.name}
              </RadioRow>
            ))}
          </FilterSection>

          {/* Assignee */}
          <FilterSection label="Assignee">
            <RadioRow
              selected={!assigneeId}
              onClick={() => setParam("assigneeId", null)}
              label="Anyone"
            />
            {members.map((m) => (
              <RadioRow
                key={m.id}
                selected={assigneeId === m.id}
                onClick={() => setParam("assigneeId", m.id)}
                label={m.name ?? m.email}
              />
            ))}
          </FilterSection>

          {/* Quadrant */}
          <FilterSection label="Quadrant">
            <RadioRow
              selected={!quadrant}
              onClick={() => setParam("quadrant", null)}
              label="Any quadrant"
            />
            {QUADRANT_IDS.map((q) => (
              <RadioRow
                key={q}
                selected={quadrant === q}
                onClick={() => setParam("quadrant", q)}
              >
                <span className="font-medium uppercase text-[10px] tracking-wider text-muted-foreground mr-2">
                  {q.toUpperCase()}
                </span>
                {QUADRANT_META[q as QuadrantId].title}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  · {QUADRANT_META[q as QuadrantId].subtitle}
                </span>
              </RadioRow>
            ))}
          </FilterSection>

          {/* Tags (multi-select) */}
          {allTags.length > 0 && (
            <FilterSection label="Tags">
              {allTags.map((t) => (
                <CheckboxRow
                  key={t.id}
                  checked={tagIds.includes(t.id)}
                  onClick={() => toggleTag(t.id)}
                >
                  <TagPill tag={t} />
                </CheckboxRow>
              ))}
            </FilterSection>
          )}

          {/* Hide completed (toggle) */}
          <FilterSection label="Display">
            <ToggleRow
              checked={hideCompleted}
              onClick={() =>
                setParam("hideCompleted", hideCompleted ? null : "true")
              }
              label="Hide completed tasks"
            />
          </FilterSection>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ---- inline-list building blocks ---- */

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        {label}
      </legend>
      <div className="rounded-lg border bg-card divide-y">{children}</div>
    </fieldset>
  );
}

/** Single-select option row. Selected state shown by a leading check + a
 *  primary-tinted background. Tap targets are 40px tall for comfortable
 *  thumb hits without being huge. */
function RadioRow({
  selected,
  onClick,
  label,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  label?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 min-h-[40px] px-3 py-2 text-left text-sm",
        "hover:bg-accent transition-colors focus-visible:outline-none focus-visible:bg-accent",
        selected && "bg-primary/8 text-foreground",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-4 shrink-0 flex items-center justify-center",
          selected ? "text-primary" : "text-transparent",
        )}
      >
        <Check className="size-4" strokeWidth={3} />
      </span>
      <span className="flex-1 min-w-0 truncate">{children ?? label}</span>
    </button>
  );
}

/** Multi-select option row. Same height + tap behaviour as RadioRow,
 *  but the leading indicator is a checkbox square so users see the
 *  semantic difference between "pick one" and "pick many". */
function CheckboxRow({
  checked,
  onClick,
  children,
}: {
  checked: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 min-h-[40px] px-3 py-2 text-left text-sm",
        "hover:bg-accent transition-colors focus-visible:outline-none focus-visible:bg-accent",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-4 shrink-0 rounded border flex items-center justify-center transition-colors",
          checked ? "bg-primary border-primary text-primary-foreground" : "border-border bg-background",
        )}
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="flex-1 min-w-0 truncate">{children}</span>
    </button>
  );
}

/** Toggle row — visually like a switch row in iOS Settings. */
function ToggleRow({
  checked,
  onClick,
  label,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onClick}
      className="w-full flex items-center justify-between gap-2 min-h-[40px] px-3 py-2 text-left text-sm hover:bg-accent transition-colors focus-visible:outline-none focus-visible:bg-accent"
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-border",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}
