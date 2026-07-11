# Kanblam usability and functionality assessment

Date: 18 May 2026  
Tester: Hermes  
Target: <https://kanblam.com>  
Account: test account supplied by Peter

## Scope covered

I logged into Kanblam and exercised the main authenticated flows:

- DayDash/dashboard
- Tasks table
- New task modal
- Task edit modal
- Quick Add
- Kanban board
- Calendar month/week views
- Eisenhower matrix
- Projects list/detail
- Tags page
- Header filters

No JavaScript console errors were observed during the tested navigations/interactions.

## Test data created

Two test tasks were created during assessment:

1. `UX assessment temp task — verify create/edit/delete`
   - Tag: `ux-test`
   - Description added
   - Subtask added
   - Used to test create/edit/persistence.

2. `UX quickadd parse test`
   - Created through Quick Add using: `#ux due:tomorrow !high !urgent`
   - Parsed into:
     - tag: `ux`
     - due date: `19 May 2026`
     - priority: `High`
     - urgent flag/indicator

These were not deleted before the browser tool limit was reached. They are safe to delete.

## What worked well

### 1. Overall app structure is clear

The main navigation is sensible:

- DayDash
- Projects
- Tasks
- Kanban
- Calendar
- Eisenhower
- Tags
- Settings

This is a good structure for a personal or small-team task app. It is easy to understand where to go.

### 2. Dashboard has the right priorities

DayDash does a good job surfacing:

- overdue tasks
- due today
- due this week
- completion
- project progress
- recent activity

The layout puts “what needs attention today” before analytics, which is the right call.

### 3. Task creation works

The normal `+ New task` flow worked. A task was created with:

- name
- description
- tag
- subtask

After saving and reopening, the description, tag, and subtask persisted correctly.

### 4. Quick Add is useful and mostly works

Quick Add successfully parsed:

- `#ux` into tag `ux`
- `due:tomorrow` into `19 May 2026`
- `!high` into priority `High`
- `!urgent` into an urgent flag/indicator

It also removed those command tokens from the task title, leaving:

```text
UX quickadd parse test
```

This is a good improvement over the earlier QA session where `!low` remained in the title.

### 5. Calendar task chips open task details

A Calendar week-view task chip opened the task modal correctly.

### 6. Tags are usable

The Tags page is simple and understandable:

- list of tags
- colour swatches
- delete buttons
- new tag input

The header tag filter also worked: selecting `ux` filtered the Tasks view down to the matching task and added a visible `Tags (1)` indicator.

## Issues and recommendations

### 1. Header filters can leak across pages and create confusion

After selecting a tag filter in Tasks, navigating to Projects still showed:

- `Tags (1)`
- `Reset filters`

The Projects list still showed the project, but the presence of a task tag filter on a Projects page is confusing.

**Recommendation:**

Make filter scope clearer.

Options:

- Keep global filters, but show a clear “Filtered by tag: ux” state and ensure every page visibly explains the effect.
- Or make filters page-specific, so task tags do not appear active on Projects unless they actually filter project contents.
- At minimum, make `Reset filters` reliably clear the visible state immediately.

### 2. Project heading has a spacing/readability issue

Project detail heading appeared as:

```text
P01—Finish KanBlam site
```

Expected:

```text
P01 — Finish KanBlam site
```

A similar joining issue appeared elsewhere as something like:

```text
P01Finish KanBlam site
```

**Recommendation:**

Audit project code/name rendering across the app and standardise on:

```text
P01 — Finish KanBlam site
```

### 3. Dashboard Recent Activity task links still appear suspect

On DayDash, clicking a Recent Activity task link did not appear to open the task modal or navigate. Clicking the task card in “Needs You Today” did work.

**Recommendation:**

Make every task reference behave consistently:

- DayDash task card
- Recent Activity row
- Tasks table row
- Kanban card
- Calendar chip
- Eisenhower card

All should open the same task modal/detail view.

### 4. New Task empty-submit has no obvious validation feedback

Clicking `Create task` with the name empty kept the modal open, but there was no obvious field-level validation message.

**Expected:**

```text
Task name is required
```

The message should be placed near the Name field.

Silent failure is worse than ugly validation. Users need to know what blocked the action.

### 5. Task edit persistence still has a probable issue

A test task was edited and the following changes were attempted:

- priority: Medium → High
- important: unchecked → checked
- added subtask

After saving and reopening:

- subtask persisted
- description persisted
- tag persisted
- priority appeared to remain Medium
- important appeared unchecked

This resembles the previous QA finding where some task fields did not persist.

**Recommendation:**

Prioritise this. A task editor that appears to save but silently drops fields undermines trust.

Specifically test save payload/backend update for:

- priority
- important
- urgent
- stage
- description
- due/start dates
- progress
- assignee
- tags
- subtasks

### 6. Kanban board is usable but dense

The Kanban board works visually and shows useful metadata:

- title
- project
- due date
- tag
- priority
- assignee
- subtask progress

But the cards are quite dense, and the rightmost `Cancelled` column was partially cut off at the tested viewport width.

**Recommendations:**

- Make horizontal scrolling more obvious.
- Consider a sticky/floating horizontal scrollbar.
- Improve column width/responsiveness.
- Make drag handles larger or more obvious.
- Add hover tooltip/full title for long cards.

### 7. Eisenhower matrix is strong, but card clicking may be inconsistent

The Eisenhower view is visually one of the stronger parts of the app. The quadrants are clear:

- Do
- Schedule
- Delegate
- Eliminate

The task cards are readable and the quadrant labels are understandable.

However, clicking a task card in Eisenhower did not obviously open the task modal during this pass. It may be drag-focused, but users will expect cards to open.

**Recommendation:**

Allow:

- click card body → open task
- drag handle → move task

Do not make the whole card only a drag/drop target.

### 8. Date formats should stay consistent

Inside the app, dates like this are good and unambiguous:

```text
18 May 2026
```

Earlier dashboard/card output used shorter forms like:

```text
May 16
```

That is acceptable for compact cards, but consistency helps.

**Recommendation:**

- Use full date in tables/detail views.
- Use short date in compact cards.
- Add tooltip/title with full date where compact dates are used.

### 9. Landing page copy spacing bug

The public homepage heading reads:

```text
The task board that tells youwhat to do next.
```

Expected:

```text
The task board that tells you what to do next.
```

Small, but it is on the first impression page.

## Recommended priority order

### Fix first

1. **Task edit save persistence**
   - Priority/important/urgent must persist reliably.
   - This is the biggest trust issue.

2. **Recent Activity / Eisenhower card opening consistency**
   - Every task reference should open the task.

3. **Form validation feedback**
   - Especially New Task empty name.

4. **Filter state clarity**
   - Avoid confusing global filters on unrelated pages.

### Then polish

5. Project code/name spacing.
6. Kanban horizontal overflow and card density.
7. Tooltips/full titles for truncated task names.
8. Landing page copy typo.
9. Slightly stronger contrast for subtle secondary text/progress indicators.

## Overall judgement

Kanblam is in decent shape for a beta. The information architecture is sound, and the core views make sense.

The strongest parts are:

- DayDash concept
- Quick Add
- Eisenhower view
- multi-view task model
- tag filtering
- project/task relationship

The main thing holding it back is not missing features. It is consistency and trust:

- if I edit a task, every changed field must persist;
- if I see a task anywhere, clicking it should do the same thing;
- if an action fails, the app should tell me why.

Fix those, and the app will feel much more solid without needing a major redesign.
