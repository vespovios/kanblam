"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Props {
  /** Current value from the URL `?q=` param (server-rendered into the
   *  page). The input is uncontrolled-ish — initial value seeds local
   *  state but typing updates local state immediately; URL syncs on a
   *  debounce so we don't hammer the server on every keystroke. */
  initial: string;
}

/** Free-text search for the Tasks list. Filters by task name + description
 *  substring. The URL `?q=` param is the source of truth — composes with
 *  the existing global filter chips so search results respect the active
 *  project/assignee/quadrant/tag filters as well. */
export function TaskSearchInput({ initial }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce URL updates by 300ms. router.replace (not push) keeps the
  // back button from filling up with "every keystroke" entries.
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams(sp);
      const trimmed = value.trim();
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pathname/sp/router are stable refs; deps would over-fire
  }, [value]);

  // Keep local state in sync ONLY when the URL changes from somewhere
  // other than this input — i.e., the user isn't actively typing. Without
  // the focus guard, this effect races with the user: their typed-but-
  // not-yet-debounced characters get blown away when our own debounce
  // round-trips back as a new `initial` prop. Skipping the sync while
  // focused means external resets (Reset Filters elsewhere) take effect
  // on the next blur, which is the right trade.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setValue(initial);
    }
  }, [initial]);

  return (
    <div className="relative w-full max-w-sm">
      <Search
        aria-hidden="true"
        className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
      />
      <Input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search tasks…"
        className="pl-8 pr-8"
        aria-label="Search tasks"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center size-5 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
