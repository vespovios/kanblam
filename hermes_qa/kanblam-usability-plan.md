# Response plan — Hermes usability assessment (18 May 2026)

This plan addresses every finding in `kanblam-usability-assessment.md`.
Items are grouped by Hermes' own priority order. Each item gets:

- **Status today**: what the code actually does right now
- **Root cause hypothesis**: best guess at why the bug surfaces
- **Proposed fix**: concrete code/UI changes
- **Scope**: rough size (S / M / L)

Where a finding is a *recurrence* of an earlier QA fix, that's called
out — usually means the earlier fix was scoped too narrowly and left
sibling code paths broken.

---

## TIER 1 — Fix first (trust-eroders)

### A. Task edit save persistence (Hermes #1) — RECURRENCE of qa#1

**Hermes' report:** Edited a task setting priority Medium → High and
ticking Important; subtask/description/tag persisted on reopen but
priority stayed Medium and Important stayed unchecked.

**Status today:** v0.5.3 wrapped `priorityId`, `isImportant`, `isUrgent`,
`description`, `tags` in `<Controller>` inside `task-edit-drawer.tsx`.
Code audit confirms those `Controller` calls are still present (lines
290, 309, 328, 358, 372, 511, 551). So the form-state plumbing is in.

**Root cause hypothesis:** the PATCH is *probably* succeeding now (per
the regression test we added at `tests/unit/validators/task.test.ts`),
but the **post-save read path** is stale:

- After save, the drawer either closes immediately (returning to the
  table that was hydrated from the original server render) or reopens
  from a cached source that doesn't reflect the new value.
- The realtime `tasks` notify exists, but the *current* tab that did
  the save uses optimistic UI / immediate refresh — that's where the
  stale read lives.

**Proposed fix — 3 steps, each verifying the next:**

1. **Reproduce with a deployed-build smoke test.** Open the drawer,
   note the priority, change it, save, reopen *without* hard-refresh.
   If the new value sticks → the bug is just visual stale state at the
   moment of save; fix by calling `router.refresh()` after a successful
   PATCH (the drawer's save handler currently does this only for some
   paths).
2. **If reproducible, log PATCH payload + response.** Add a temporary
   `console.debug` in `doSave` to confirm priority is in the request
   body. Common failure mode is RHF's `watch()` returning a *snapshot*
   that misses last-edit-before-blur changes — wrap the submit in
   `formState.isValidating` waits if needed.
3. **Server-side cross-check.** After PATCH, `lib/tasks/service.ts`
   `updateTask` should return the row with all fields including the
   updated priority. If it returns the *prior* shape and the drawer
   trusts the response, that's the bug. Verify the Prisma `update`
   call's `select` (or default return) includes everything the drawer
   reads back.

**Scope:** **S–M**. Probably one or two targeted changes plus a new
Playwright integration test that drives the actual drawer end-to-end.

---

### B. Recent Activity / Eisenhower / "any task reference" consistency (Hermes #2)

**Hermes' report:** Recent Activity rows on DayDash and cards in
Eisenhower don't open the task drawer the way Tasks/Kanban/Calendar
rows do.

**Status today:**

- `dashboard-recent-activity.tsx` *does* use the stretched-link
  pattern with `before:absolute before:inset-0` on the inner `<Link>`,
  but the link's parent `<td>` is itself `position: relative` for the
  truncation behaviour — which means `before:inset-0` covers only that
  one cell, not the whole row. So the FIRST column (task name) is
  clickable but the others aren't, which matches the "appears suspect"
  symptom in the report.
- `components/eisenhower/` has **zero `onClick` or `<Link>` to
  `/tasks?taskId=`** — cards are drag-only. The grep confirms.

**Proposed fix:**

1. **Recent Activity:** rework the `<tr>` itself to be the `<Link>` (or
   keep `<tr>` and wrap the cells in `<Link>` siblings with the
   stretched-link properly anchored to the row, not the cell). Cleanest
   approach is to use a `<tr>` with `onClick` + `cursor-pointer` +
   `aria-rowindex` and let the first column carry the `<Link>` for
   keyboard a11y. The clickable row is the established pattern across
   the rest of the app.
2. **Eisenhower:** add a `<Link href={`/tasks?taskId=${task.id}`}>` or
   `onClick` to open the drawer, while preserving drag-and-drop. The
   pattern is: `onPointerDown` triggers drag-start above a threshold,
   `onClick` (which fires only when no drag occurred) opens the drawer.
   `@dnd-kit` exposes this exact distinction via its
   `useSortable`/`useDraggable` hooks — we already use the same
   pattern on Kanban cards.

**Scope:** **M**. Two components, the Eisenhower one needs careful
DnD interaction. ~1-2 hours.

---

### C. Form validation — visible feedback on empty submits (Hermes #3) — POSSIBLE RECURRENCE of qa#3

**Hermes' report:** Clicking "Create task" with empty name kept the
modal open with no obvious error.

**Status today:** v0.5.3 (qa#3) added zod custom message + `aria-invalid`
+ `aria-describedby` + `role="alert"` to the **New Task modal** in
`task-create-dialog.tsx`. The same treatment was NOT applied to:

- The **Quick Add palette** if used with empty input (already gated on
  `hasInput` in qa#7, so this path is fine).
- The **task edit drawer** save with cleared name.

The most likely cause of the recurrence: Hermes tested **a different
entry point** to "New Task" than the one we patched. There may be
multiple "+ New task" buttons (from /tasks toolbar, from a project's
Tasks tab, from Kanban "+", etc.) and not all open the same dialog
component.

**Proposed fix:**

1. Audit every "Create task" entry point. Confirm they all route through
   `task-create-dialog.tsx` (the one with the qa#3 fix) and not a
   different component.
2. Apply the same validation pattern to the **task edit drawer** save
   path so editing into an empty name shows the inline error before
   closing the drawer.

**Scope:** **S**. Audit + 1-2 small component edits. ~30 min.

---

## TIER 2 — Polish

### D. Filter state clarity / cross-page leakage (Hermes #4)

**Hermes' report:** Selecting `Tags (1)` on Tasks, then navigating to
Projects, still shows the `Tags (1)` chip and "Reset filters" — but
the tag filter doesn't affect the Projects list at all.

**Status today:** Global filters cascade by design via URL params
(`?projectId=`, `?assigneeId=`, `?tags=`, `?quadrant=`, `?hideCompleted=`).
The topbar's `tabHrefWithGlobals` preserves them across cross-tab
navigation, even when they're not meaningful on the destination.

This was a deliberate choice from the v0.3.0 redesign — keep one
mental model: "filters are workspace-wide". But Hermes is right that
showing an active filter on a page where it has no effect is
confusing.

**Proposed fix:** make filter visibility *per-page* based on what
each page actually consumes:

- DayDash, Tasks, Kanban, Calendar, Eisenhower: show all five chips
  (project, assignee, quadrant, tags, hide-completed).
- Projects, Tags, Settings: show only chips that affect their data
  (probably none for now). Filters set on other pages remain in the URL
  so navigating back preserves state — they're just not surfaced.

Mechanics:
- Add a `Page` taxonomy: which filter dimensions each route consumes.
- `GlobalFilters` reads its parent route from `usePathname`, looks up
  the consumed set, and only renders those chips.
- `tabHrefWithGlobals` still preserves all params (for "go back to
  Tasks and your tag filter is still there" behaviour).

**Scope:** **S–M**. One `lib/global-filters/scope.ts` taxonomy +
GlobalFilters branch on it. ~45 min.

---

### E. Project code/name spacing audit (Hermes #5) — PARTIAL RECURRENCE of qa#9

**Hermes' report:** Project detail heading shows `P01—Finish KanBlam
site` (no spaces around em-dash) in some places, `P01Finish KanBlam
site` (no separator at all) in others.

**Status today:** Code search shows multiple inconsistent patterns:

- `task-edit-drawer.tsx`: `{code} · {name}` (middle-dot)
- `task-create-dialog.tsx`: `{code} — {name}` (em-dash with spaces)
- `projects-list.tsx`: `{code}` then `{name}` in separate cells
- `dashboard-project-progress.tsx`: just `{code}`
- `global-filters.tsx`: `<span>{code}</span>` + spacing utility

So three different separators (·, —, none) live in the codebase.
qa#9 fixed one specific location.

**Proposed fix:** make a `<ProjectCodeName>` shared component that
renders `<span class="font-mono">{code}</span><span>·</span><span>{name}</span>`
with consistent spacing. Replace every ad-hoc rendering with it.
Pick ONE separator — recommend ` · ` (middle dot) since it's softer
than em-dash for inline tag-style display and matches the drawer
already.

**Scope:** **S**. New tiny component + replace 5-6 callsites. ~30 min.

---

### F. Kanban density + rightmost column cutoff (Hermes #6)

**Hermes' report:** Cards quite dense, Cancelled column partially cut
off at tested viewport width, horizontal scrolling not obvious, drag
handles could be larger.

**Status today:** Kanban grid uses CSS grid with fixed-min columns.
Five stages × min-width = wider than narrow laptops. Overflow is
horizontal-scroll on a generic container.

**Proposed fix:** medium-scope visual polish:

1. Stickier scroll affordance — bottom-pinned horizontal scrollbar
   or "→ more" pill at the right edge on overflow.
2. Tighter card padding on narrow viewports (already done for mobile
   topbar in v0.5.2 — same approach).
3. Optional: collapsible columns so a column you don't actively use
   (Cancelled, Ideas) can be folded to a thin sidebar.
4. Larger drag handles — currently the whole card is the handle, but
   the affordance isn't visually obvious. Add a grip-dots icon in the
   top-right of each card.

**Scope:** **M–L**. Genuine UX session, deserves its own pass. ~1-2
hours done well.

---

### G. Truncated task names — full-title tooltips (Hermes' polish list)

**Status today:** Long task names truncate with `truncate` but have
no `title` attribute, so hover doesn't reveal the full text.

**Proposed fix:** add `title={task.name}` (or a styled tooltip via
Base UI) to every truncated task title — kanban cards, calendar pills,
tasks-table rows. Cheap a11y + usability win.

**Scope:** **S**. Mostly attribute additions across 4-5 components.

---

### H. Date format consistency (Hermes #8)

**Status today:** v0.5.3 standardised most sites on `formatShortDate()`
→ `16 May 2026`. Hermes flagged compact cards still using `May 16`.

**Proposed fix:** audit remaining `toLocaleDateString` and inline
date formatting. Use the existing `formatShortDate()` where space
allows; for compact cards (Kanban, Calendar pills) where DD-Mon is
all that fits, add a `title={formatShortDate(date)}` so hover reveals
full date.

**Scope:** **S**. Grep sweep + ~6 callsite edits. ~20 min.

---

### I. Landing page copy: `tells youwhat to do next.` (Hermes #9)

**Status today:** `components/marketing/landing-page.tsx` line 113-114:

```tsx
The task board that tells you{" "}
<span className="text-primary">what to do next</span>.
```

The `{" "}` *should* render a space. Most likely Hermes' renderer
collapsed/normalised whitespace in the bot's text extraction. But it's
worth bulletproofing — switch to a non-breaking space or move the
space inside the static text.

**Proposed fix:** change to:

```tsx
The task board that tells you <span ...>what to do next</span>.
```

(plain space inside the JSX literal — Babel preserves the space here
because it's between the closing `}` and the `<` of the next tag, which
is unambiguous).

**Scope:** **XS**. One-line edit. ~1 min.

---

### J. Stronger contrast for secondary text (Hermes' polish list)

**Status today:** Soft Slate palette uses `--muted-foreground: #717a8a`
on light, `#808996` on dark. Both pass WCAG AA against backgrounds
when the foreground is large/bold, but for small body text the
contrast is borderline.

This is on the followup list already (from the earlier session, listed
as "low-contrast empty states audit" in the handoff). Same item, same
fix.

**Proposed fix:** bump `--muted-foreground` one notch darker (target
≥4.5:1 against `--background`), audit specific empty-state surfaces
Hermes flagged.

**Scope:** **S**. Token bump + spot-check. ~20 min.

---

## Suggested release plan

These cluster cleanly into three deployable patches. None depends on
another, so they can ship in any order.

### v0.5.8 — Trust fixes (Tier 1: A, B, C)

Fixes the three "I edited a task and nothing happened / clicked a row
and nothing happened / submitted an empty form and got nothing" trust
issues. Highest user-perceived impact, deserves its own release for
visibility. ~2-3 hours.

### v0.5.9 — Polish pass (D, E, G, H, I, J)

Filter scope, project code/name standardisation, tooltips, dates,
landing typo, contrast. Lot of small cosmetic improvements. ~2 hours.

### v0.6.0 — Kanban visual rework (F + #38 mobile filter sheet)

The kanban density issue and the mobile filter bottom-sheet from the
existing followup list are both visual reworks worth doing together —
share the same "use a Drawer for narrow viewports" pattern. Own
session. ~3 hours.

---

## What this plan does NOT cover

- **Password-change UI** (task #35) — Hermes didn't flag it; beta users
  still acceptable.
- **HSTS preload submission** — launch-time housekeeping.
- **Handoff doc deferral: a11y for kanban/calendar/eisenhower keyboard
  DnD** — separate session, deserves design think.

---

## Confidence + risks

- **A (task save persistence)** is the only finding where I'm not
  100% sure of the cause without reproducing on the deployed build.
  If the fix turns out to be more invasive than the hypothesis above,
  expect v0.5.8 to slip to "trust fixes" being B and C, with A getting
  its own focused session.
- **D (filter scope)** is the most opinionated change here. The current
  design (global filters always visible) was deliberate. The proposed
  change makes filters smarter but adds a per-route taxonomy that has
  to stay in sync as new pages land. Worth doing but verify the
  trade-off lands well with you before I build it.
- Everything else is mechanical.
