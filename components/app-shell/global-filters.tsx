"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useMemo } from "react";
import { ChevronDown, X } from "lucide-react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { cn } from "@/lib/utils";
import { QUADRANT_IDS, QUADRANT_META, type QuadrantId } from "@/lib/eisenhower/quadrants";

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

/**
 * ECM-Pulse-style global filter strip: amber pill-button dropdowns that
 * cascade to every page that respects the URL filter params
 * (`?projectId=`, `?assigneeId=`, `?quadrant=`, `?tags=`, `?hideCompleted=`).
 *
 * The Lane toggle on /kanban stays on-page since `?lane=` only makes
 * sense there.
 */
export function GlobalFilters({ projects, members, allTags }: Props) {
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

  const activeProject = projects.find((p) => p.id === projectId);
  const activeMember = members.find((m) => m.id === assigneeId);

  const anyActive =
    !!projectId || !!assigneeId || !!quadrant || tagIds.length > 0 || hideCompleted;

  return (
    <div className="flex flex-nowrap items-center gap-2">
      {/* Project */}
      <FilterButton
        label={activeProject ? `${activeProject.code} — ${activeProject.name}` : "All projects"}
        active={!!projectId}
      >
        <FilterMenuItem onSelect={() => setParam("projectId", null)} active={!projectId}>
          All projects
        </FilterMenuItem>
        <FilterMenuSeparator />
        {projects.map((p) => (
          <FilterMenuItem
            key={p.id}
            onSelect={() => setParam("projectId", p.id)}
            active={projectId === p.id}
          >
            <span className="font-mono text-xs text-muted-foreground mr-1.5">{p.code}</span>
            {p.name}
          </FilterMenuItem>
        ))}
      </FilterButton>

      {/* Assignee */}
      <FilterButton
        label={activeMember ? (activeMember.name ?? activeMember.email) : "Anyone"}
        active={!!assigneeId}
      >
        <FilterMenuItem onSelect={() => setParam("assigneeId", null)} active={!assigneeId}>
          Anyone
        </FilterMenuItem>
        <FilterMenuSeparator />
        {members.map((m) => (
          <FilterMenuItem
            key={m.id}
            onSelect={() => setParam("assigneeId", m.id)}
            active={assigneeId === m.id}
          >
            {m.name ?? m.email}
          </FilterMenuItem>
        ))}
      </FilterButton>

      {/* Quadrant */}
      <FilterButton
        label={
          quadrant && (QUADRANT_IDS as readonly string[]).includes(quadrant)
            ? QUADRANT_META[quadrant as QuadrantId].title
            : "Any quadrant"
        }
        active={!!quadrant}
      >
        <FilterMenuItem onSelect={() => setParam("quadrant", null)} active={!quadrant}>
          Any quadrant
        </FilterMenuItem>
        <FilterMenuSeparator />
        {QUADRANT_IDS.map((id) => (
          <FilterMenuItem
            key={id}
            onSelect={() => setParam("quadrant", id)}
            active={quadrant === id}
          >
            {QUADRANT_META[id].title}
          </FilterMenuItem>
        ))}
      </FilterButton>

      {/* Tags — multi-select via checkbox items, label shows count when active */}
      <FilterButton
        label={tagIds.length > 0 ? `Tags (${tagIds.length})` : "All tags"}
        active={tagIds.length > 0}
      >
        {allTags.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground italic">no tags yet</div>
        ) : (
          allTags.map((t) => {
            const checked = tagIds.includes(t.id);
            return (
              <MenuPrimitive.CheckboxItem
                key={t.id}
                checked={checked}
                onClick={(e) => {
                  e.preventDefault();
                  toggleTag(t.id);
                }}
                className="relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground"
              >
                <CheckboxPrimitive.Root
                  checked={checked}
                  className="size-4 shrink-0 rounded border border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary flex items-center justify-center"
                >
                  <CheckboxPrimitive.Indicator className="text-primary-foreground text-xs">
                    ✓
                  </CheckboxPrimitive.Indicator>
                </CheckboxPrimitive.Root>
                <span
                  className="px-1.5 py-0.5 rounded text-xs font-medium"
                  style={{ background: t.color }}
                >
                  {t.name}
                </span>
              </MenuPrimitive.CheckboxItem>
            );
          })
        )}
      </FilterButton>

      {/* Hide completed — pressable button (not a dropdown). Solid primary
          pill matches the other filter buttons; the active state adds a
          checkmark + a subtle ring outline. */}
      <button
        type="button"
        onClick={() => setParam("hideCompleted", hideCompleted ? null : "true")}
        aria-pressed={hideCompleted}
        className={cn(
          "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold whitespace-nowrap transition-[filter] shadow-sm",
          "bg-primary text-primary-foreground hover:brightness-110",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--header-bg)]",
          hideCompleted && "ring-2 ring-primary-foreground/40",
        )}
      >
        {hideCompleted && <span aria-hidden="true">✓</span>}
        Hide completed
      </button>

      {/* Reset — solid primary pill, only visible when any filter is active.
          Same chrome as the other filter buttons but smaller and with a
          leading X icon. */}
      {anyActive && (
        <button
          type="button"
          onClick={resetAll}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold whitespace-nowrap shadow-sm bg-primary text-primary-foreground hover:brightness-110 transition-[filter] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--header-bg)]"
        >
          <X className="size-3.5" />
          Reset filters
        </button>
      )}
    </div>
  );
}

/* ---- internal building blocks ---- */

function FilterButton({
  label,
  active,
  children,
}: {
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger
        className={cn(
          "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold whitespace-nowrap transition-[filter] shadow-sm",
          "bg-primary text-primary-foreground hover:brightness-110",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--header-bg)]",
          // Subtle ring when active so user can still tell a filter is set
          active && "ring-2 ring-primary-foreground/40",
        )}
      >
        <span className="max-w-[12rem] truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-80" />
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        {/* z-50 must sit on the Positioner, not just the Popup — the
            Positioner is position:fixed and creates its own stacking
            context, so without a z-index here it loses to the sticky
            header's z-30 and the menu renders behind the tab strip. */}
        <MenuPrimitive.Positioner className="isolate z-50 outline-none" align="start" sideOffset={6}>
          <MenuPrimitive.Popup className="min-w-48 max-h-(--available-height) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none">
            {children}
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

function FilterMenuItem({
  active,
  onSelect,
  children,
}: {
  active?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <MenuPrimitive.Item
      onClick={onSelect}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md px-2 py-1.5 text-sm outline-none select-none",
        "focus:bg-accent focus:text-accent-foreground",
        active && "bg-secondary text-secondary-foreground font-medium",
      )}
    >
      {children}
    </MenuPrimitive.Item>
  );
}

function FilterMenuSeparator() {
  return <MenuPrimitive.Separator className="my-1 h-px bg-border" />;
}
