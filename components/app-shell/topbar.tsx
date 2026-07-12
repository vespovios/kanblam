"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import type { UserRole } from "@prisma/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { QuickAddTriggerButton } from "@/components/quick-add/quick-add-trigger-button";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { GlobalFilters } from "@/components/app-shell/global-filters";
import { MobileFilters } from "@/components/app-shell/mobile-filters";
import { cn } from "@/lib/utils";

interface TopbarProps {
  workspaceName: string;
  userName: string | null;
  userEmail: string;
  role: UserRole;
  projects: { id: string; name: string; code: string }[];
  members: { id: string; name: string | null; email: string; kind: "HUMAN" | "AGENT" }[];
  allTags: { id: string; name: string; color: string }[];
}

interface NavTab {
  href: string;
  label: string;
  /** Route prefixes that should mark this tab active. */
  match: string[];
}

const NAV_TABS: NavTab[] = [
  { href: "/dashboard", label: "DayDash", match: ["/dashboard", "/today"] },
  { href: "/projects", label: "Projects", match: ["/projects"] },
  { href: "/tasks", label: "Tasks", match: ["/tasks"] },
  { href: "/kanban", label: "Kanban", match: ["/kanban"] },
  { href: "/calendar", label: "Calendar", match: ["/calendar"] },
  { href: "/eisenhower", label: "Eisenhower", match: ["/eisenhower"] },
  { href: "/tags", label: "Tags", match: ["/tags"] },
];

const ADMIN_TAB: NavTab = {
  href: "/settings",
  label: "Settings",
  match: ["/settings"],
};

/** URL params that cascade across all tabs. Page-specific ones (taskId,
 *  tab, lane, date) are stripped on cross-tab navigation. */
const GLOBAL_FILTER_PARAMS = [
  "projectId",
  "assigneeId",
  "quadrant",
  "tags",
  "hideCompleted",
] as const;

function isActive(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** Build a tab href that preserves only the global filter params, dropping
 *  page-specific ones so opening Tasks doesn't trail along ?taskId= from
 *  a previous drawer state. */
function tabHrefWithGlobals(base: string, sp: URLSearchParams): string {
  const next = new URLSearchParams();
  for (const key of GLOBAL_FILTER_PARAMS) {
    const v = sp.get(key);
    if (v) next.set(key, v);
  }
  const qs = next.toString();
  return qs ? `${base}?${qs}` : base;
}

export function Topbar({
  workspaceName,
  userName,
  userEmail,
  role,
  projects,
  members,
  allTags,
}: TopbarProps) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const initials = (userName ?? userEmail).slice(0, 2).toUpperCase();
  const tabs = role === "ADMIN" ? [...NAV_TABS, ADMIN_TAB] : NAV_TABS;

  return (
    <header className="sticky top-0 z-30 flex flex-col">
      {/* Band 1 — brand + global filters + actions. A LIGHT pale-slate
          surface (Soft Slate design language); everything inside reads
          from --header-foreground so it works on a light band. */}
      <div
        className="px-3 py-2 md:px-4 md:py-3 flex items-center gap-2 md:gap-5 flex-nowrap border-b"
        style={{
          background: "var(--header-bg)",
          color: "var(--header-foreground)",
          borderColor: "var(--header-border)",
        }}
      >
        {/* Brand — full logo lifted onto a white pill. The pill keeps the
            artwork legible regardless of how light/dark the band is. Shrinks
            on mobile so the topbar doesn't eat half the screen. */}
        <Link href="/dashboard" className="flex items-center gap-2 md:gap-3 shrink-0 group">
          <div className="bg-white rounded-lg md:rounded-xl px-2 py-1 md:px-3 md:py-2 shadow-sm ring-1 ring-black/5 group-hover:shadow-md transition-shadow">
            <Image
              src="/kanblam-logo2.jpg"
              alt="KanBlam!"
              width={400}
              height={120}
              className="h-8 md:h-14 w-auto block"
              priority
            />
          </div>
          <div
            className="hidden md:block min-w-0 leading-tight border-l pl-3"
            style={{ borderColor: "var(--header-border)" }}
          >
            <div
              className="text-[10px] uppercase tracking-wider"
              style={{ color: "var(--header-muted)" }}
            >
              Workspace
            </div>
            <div className="text-base font-medium truncate max-w-[14rem]">{workspaceName}</div>
          </div>
        </Link>

        {/* Global filter strip — horizontal pills on desktop, collapsed to
            a single "Filters" trigger + bottom sheet on mobile (v0.6.0).
            The v0.5.2 horizontal-scroll stopgap was workable but the chips
            still ate horizontal space; the sheet keeps the topbar compact
            and gives each filter full width inside the drawer. */}
        <div className="flex-1 min-w-0 hidden md:block">
          <GlobalFilters projects={projects} members={members} allTags={allTags} />
        </div>
        <div className="flex-1 md:hidden">
          <MobileFilters projects={projects} members={members} allTags={allTags} />
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 shrink-0">
          <ThemeToggle />
          <QuickAddTriggerButton />
          <DropdownMenu>
            <DropdownMenuTrigger className="outline-none rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--header-bg)]">
              <Avatar className="h-9 w-9 bg-primary text-primary-foreground">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled>{userEmail}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Band 2 — tab strip. Card surface, accent text + underline on the
          active tab. */}
      <nav
        aria-label="Primary"
        className="bg-card text-card-foreground border-b border-border px-4 flex items-center gap-1 overflow-x-auto"
      >
        {tabs.map((tab) => {
          const active = isActive(pathname, tab.match);
          return (
            <Link
              key={tab.href}
              href={tabHrefWithGlobals(tab.href, sp)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute left-2 right-2 -bottom-px h-[3px] rounded-t bg-primary"
                />
              )}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
