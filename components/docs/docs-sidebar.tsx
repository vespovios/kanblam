"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

/** Source of truth for the docs site's left-nav. Add new pages here in
 *  the order they should appear. */
const NAV: NavSection[] = [
  {
    items: [{ href: "/docs", label: "Introduction" }],
  },
  {
    title: "Getting started",
    items: [{ href: "/docs/getting-started", label: "First login" }],
  },
  {
    title: "Using KanBlam",
    items: [
      { href: "/docs/daydash", label: "DayDash" },
      { href: "/docs/tasks", label: "Tasks, subtasks & tags" },
      { href: "/docs/projects", label: "Projects" },
      { href: "/docs/kanban", label: "Kanban board" },
      { href: "/docs/eisenhower", label: "Eisenhower matrix" },
      { href: "/docs/calendar", label: "Calendar" },
      { href: "/docs/recurring", label: "Recurring tasks" },
    ],
  },
  {
    title: "API",
    items: [
      { href: "/docs/api-quickstart", label: "Quickstart" },
      { href: "/docs/api", label: "Reference" },
      { href: "/docs/agents", label: "Bring your agent" },
    ],
  },
  {
    title: "Reference",
    items: [
      { href: "/docs/keyboard", label: "Keyboard shortcuts" },
      { href: "/docs/import", label: "Import from Asana" },
      { href: "/docs/account", label: "Account & settings" },
    ],
  },
  {
    title: "Self-host",
    items: [{ href: "/docs/self-host", label: "Running it yourself" }],
  },
];

/** Sticky left-nav for /docs/*. Hidden below md (the docs page renders
 *  full-width on mobile — most beta-tester docs reading happens at desk).
 *  When the docs surface graduates to a full Nextra theme, this gets
 *  replaced with the auto-generated page-tree sidebar. */
export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:block w-56 shrink-0 sticky top-16 self-start py-8 pr-6 border-r border-border">
      <nav aria-label="Documentation">
        {NAV.map((section, i) => (
          <div key={i} className={cn(i > 0 && "mt-6")}>
            {section.title && (
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </h4>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block px-2 py-1 rounded-md text-sm transition-colors",
                        active
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
