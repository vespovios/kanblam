# Dogfood QA Report

**Target:** https://kanblam.com  
**Date:** 2026-05-17  
**Scope:** Exploratory QA of public landing/login flows and authenticated Kanblam beta workspace flows. Tested dashboard, quick add, tasks, task detail modal, subtasks, tags, Kanban, Calendar, Eisenhower, Projects, project detail, and project edit modal.  
**Tester:** Hermes Agent, automated exploratory QA with browser tools

---

## Executive Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 1 |
| Medium | 5 |
| Low | 6 |
| **Total** | **12** |

**Overall assessment:** Kanblam is already usable and visually coherent, but a few task-editing and quick-add behaviours need attention before beta users rely on it for real work.

The strongest issue found is that task edits appear to save partially: subtasks persist, but priority, important flag, and description did not persist after saving and reopening. This is the sort of bug that will quietly damage user trust because the UI gives the impression that changes were accepted.

No JavaScript console errors were observed during the tested flows.

---

## Issues

### Issue #1: Task edit Save only persists some fields

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Functional |
| **URL** | https://kanblam.com/tasks |

**Description:**
Editing an existing task and pressing Save did not persist all changed fields. The subtask was retained, but priority, important status, and description reverted or disappeared after reopening the task.

**Steps to reproduce:**
1. Create a task, or open an existing task from the Tasks page.
2. Change priority from Medium to Low.
3. Tick Important.
4. Add a description such as `QA description with special chars <script>alert(1)</script> & emoji ✅`.
5. Add a subtask such as `QA subtask one`.
6. Click Save.
7. Reopen the task.

**Expected behaviour:**
All edited fields persist after Save and are visible when the task is reopened.

**Actual behaviour:**
- Subtask persisted.
- Tag persisted.
- Due date persisted.
- Priority reverted to Medium.
- Important reverted to unchecked.
- Description was empty after reopening.

**Evidence:**
- Task detail/edit modal: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_809591cc4c68424eb3512241d6e39ca4.png`

**Console errors:**
None observed.

---

### Issue #2: Quick Add does not parse `!low` as priority

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Category** | Functional / UX |
| **URL** | https://kanblam.com/dashboard |

**Description:**
Quick Add successfully parsed some inline syntax, but not priority syntax. The task was entered with `#qa due:tomorrow !low`. The tag and due date were parsed, but `!low` remained in the task title and the priority stayed Medium.

**Steps to reproduce:**
1. Open Quick Add.
2. Enter: `QA test task from Hermes #qa due:tomorrow !low`.
3. Press Enter to create the task.
4. Open the task in Tasks, Kanban, Calendar, or Eisenhower.

**Expected behaviour:**
- `#qa` becomes tag `qa`.
- `due:tomorrow` becomes the next date.
- `!low` becomes Low priority.
- Parsed command tokens are removed from the task title.

**Actual behaviour:**
- `#qa` parsed correctly.
- `due:tomorrow` parsed correctly.
- `!low` remained in the task title.
- Priority remained Medium.

**Evidence:**
- Quick Add modal: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_55477228b38346f8932f4de25334d281.png`
- Tasks page after creation: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_809591cc4c68424eb3512241d6e39ca4.png`
- Kanban page: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_fc9c34e5d2ee446c822603cfe9a46f8a.png`

**Console errors:**
None observed.

---

### Issue #3: New task modal empty submit gives no visible validation feedback

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Category** | UX / Functional |
| **URL** | https://kanblam.com/tasks |

**Description:**
Submitting the New Task modal with the required Name field empty did not show an obvious validation message. The modal remained open, but there was no clear indication of what the user needed to fix.

**Steps to reproduce:**
1. Go to Tasks.
2. Click `+ New task`.
3. Leave Name empty.
4. Click `Create task`.

**Expected behaviour:**
A clear validation message appears near the Name field, for example: `Task name is required`.

**Actual behaviour:**
The modal stayed open with no obvious validation message in the accessibility snapshot or visual state.

**Evidence:**
- Tasks page: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_809591cc4c68424eb3512241d6e39ca4.png`

**Console errors:**
None observed.

---

### Issue #4: Recent Activity task links did not open task detail

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Category** | Functional / UX |
| **URL** | https://kanblam.com/dashboard |

**Description:**
Clicking a newly-created task from the DayDash Recent Activity table did not open the task detail modal or navigate to a task detail page.

**Steps to reproduce:**
1. Create a task using Quick Add.
2. Return to DayDash/dashboard.
3. In Recent Activity, click the task title link.

**Expected behaviour:**
The task detail modal opens, or the browser navigates to the task detail page.

**Actual behaviour:**
The click appeared to do nothing. The URL remained `/dashboard` and no modal opened.

**Evidence:**
- Dashboard: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_96da2f922dce4354853220d6bb4a0c59.png`

**Console errors:**
None observed.

---

### Issue #5: Calendar, Kanban, and Eisenhower rely heavily on drag-and-drop and small icons

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Category** | Accessibility / UX |
| **URL** | https://kanblam.com/kanban, https://kanblam.com/calendar, https://kanblam.com/eisenhower |

**Description:**
The Kanban and Eisenhower views rely heavily on drag-and-drop task movement. Small icons such as star, timer/clock, coloured dots, and drag handles are visible but their meaning is not obvious from the UI. Keyboard-accessible alternatives were not evident during this pass.

**Steps to reproduce:**
1. Open Kanban.
2. Inspect task cards and drag handles.
3. Open Eisenhower.
4. Inspect quadrant cards and empty-state drop zones.
5. Open Calendar.
6. Inspect task chips and icons.

**Expected behaviour:**
- Icon meanings are available through labels, tooltips, or accessible names.
- Drag-and-drop actions have keyboard-accessible alternatives.
- Task chips/cards expose useful semantic labels to assistive technology.

**Actual behaviour:**
The visual UI is usable for sighted pointer users, but icon meanings and non-pointer workflows are not clear from the tested interface.

**Evidence:**
- Kanban: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_fc9c34e5d2ee446c822603cfe9a46f8a.png`
- Calendar: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_4852b94e691248ddaf7dbda049f4b115.png`
- Eisenhower: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_fd7172717b4e4aaf8547335fd9aa7102.png`

**Console errors:**
None observed.

---

### Issue #6: Dashboard says action lists are paused, but still shows task under Needs You Today

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Category** | UX |
| **URL** | https://kanblam.com/dashboard |

**Description:**
DayDash displays the message: `Today is a non-working day — the action lists below are paused.` However, it still shows an overdue task in `Needs You Today`. This may be intentional, but the wording is confusing.

**Steps to reproduce:**
1. Log in on a non-working day.
2. Open DayDash.
3. Read the page subtitle and `Needs You Today` section.

**Expected behaviour:**
The relationship between non-working day behaviour and visible overdue/urgent tasks is clear.

**Actual behaviour:**
The page says lists are paused, but still presents a task as needing attention today.

**Evidence:**
- Dashboard: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_96da2f922dce4354853220d6bb4a0c59.png`

**Console errors:**
None observed.

---

### Issue #7: Quick Add shows validation error immediately on open

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | UX |
| **URL** | https://kanblam.com/dashboard |

**Description:**
Opening Quick Add immediately displayed the validation error `Task needs a name`, before the user had attempted to submit.

**Steps to reproduce:**
1. Click `Quick add`.
2. Observe the modal state before typing.

**Expected behaviour:**
The modal opens in a neutral state. Validation appears only after an empty submit, blur, or other user interaction.

**Actual behaviour:**
The modal immediately shows `Task needs a name`.

**Evidence:**
- Quick Add modal: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_55477228b38346f8932f4de25334d281.png`

**Console errors:**
None observed.

---

### Issue #8: Login validation exposes developer/schema wording

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | UX / Content |
| **URL** | https://kanblam.com/login |

**Description:**
Empty login submission shows a technical validation message for the password field: `Too small: expected string to have >=1 characters`.

**Steps to reproduce:**
1. Open Login.
2. Submit the form with empty Email and Password fields.

**Expected behaviour:**
Human-friendly validation messages:
- `Email is required`
- `Password is required`

**Actual behaviour:**
- Email: `Invalid email address`
- Password: `Too small: expected string to have >=1 characters`

**Evidence:**
- Login validation: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_6e9c61683f7b49e39a42e0023dbfd78f.png`

**Console errors:**
None observed.

---

### Issue #9: Project detail heading lacks spacing between project code and name

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Visual / Content |
| **URL** | Project detail page |

**Description:**
The project detail heading renders the project code and title without spacing: `P01Finish Kamblam site`.

**Steps to reproduce:**
1. Go to Projects.
2. Open project `Finish Kamblam site`.
3. Inspect the heading.

**Expected behaviour:**
The code and title are visually separated, for example:
- `P01 — Finish Kamblam site`
- `P01 Finish Kamblam site`

**Actual behaviour:**
The heading appears as `P01Finish Kamblam site`.

**Evidence:**
- Project detail: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_6e2422cfbc08448fb428dc66bc778953.png`

**Console errors:**
None observed.

---

### Issue #10: Brand/project spelling inconsistency: KanBlam vs Kamblam

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Content |
| **URL** | Project list/detail |

**Description:**
The product brand appears as `KanBlam`, but the project is named `Finish Kamblam site`. If this refers to the product itself, it looks like a spelling/capitalisation inconsistency.

**Steps to reproduce:**
1. View the app header/logo.
2. Open Projects.
3. Compare the brand name with the project name.

**Expected behaviour:**
Product/project references use consistent spelling, unless the inconsistency is intentional.

**Actual behaviour:**
- Brand: `KanBlam`
- Project: `Finish Kamblam site`

**Evidence:**
- Project detail: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_6e2422cfbc08448fb428dc66bc778953.png`

**Console errors:**
None observed.

---

### Issue #11: Date formatting is US-style and potentially ambiguous

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | UX |
| **URL** | Tasks, Calendar, Projects |

**Description:**
Dates are displayed in US-style numeric format such as `5/16/2026` and `5/18/2026`. For international users this can be ambiguous, especially for dates where both day and month are <= 12.

**Steps to reproduce:**
1. Open Tasks.
2. Inspect due date formatting.
3. Open Calendar and Projects.
4. Inspect task and project dates.

**Expected behaviour:**
Use a locale-aware or unambiguous date format, such as:
- `16 May 2026`
- `2026-05-16`
- or user-locale based formatting.

**Actual behaviour:**
Dates display as `M/D/YYYY`.

**Evidence:**
- Tasks page: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_809591cc4c68424eb3512241d6e39ca4.png`
- Calendar: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_4852b94e691248ddaf7dbda049f4b115.png`

**Console errors:**
None observed.

---

### Issue #12: Some secondary text, placeholders, and empty states have low contrast

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Accessibility / Visual |
| **URL** | Multiple pages |

**Description:**
Several pieces of secondary text appear light and may fail contrast checks depending on exact colours. Examples include dashboard chart labels, empty-state text such as `Drop tasks here`, small metadata in cards, and some placeholder/helper text.

**Steps to reproduce:**
1. Open Dashboard, Kanban, Calendar, and Eisenhower.
2. Inspect empty states, metadata, chart labels, and muted text.

**Expected behaviour:**
Text meets WCAG AA contrast where it communicates useful information.

**Actual behaviour:**
Some text is visually subtle and may be hard to read for low-vision users.

**Evidence:**
- Dashboard: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_96da2f922dce4354853220d6bb4a0c59.png`
- Kanban: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_fc9c34e5d2ee446c822603cfe9a46f8a.png`
- Eisenhower: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_fd7172717b4e4aaf8547335fd9aa7102.png`

**Console errors:**
None observed.

---

## Issues Summary Table

| # | Title | Severity | Category | URL |
|---|-------|----------|----------|-----|
| 1 | Task edit Save only persists some fields | High | Functional | /tasks |
| 2 | Quick Add does not parse `!low` as priority | Medium | Functional / UX | /dashboard |
| 3 | New task modal empty submit gives no visible validation feedback | Medium | UX / Functional | /tasks |
| 4 | Recent Activity task links did not open task detail | Medium | Functional / UX | /dashboard |
| 5 | Calendar, Kanban, and Eisenhower rely heavily on drag-and-drop and small icons | Medium | Accessibility / UX | /kanban, /calendar, /eisenhower |
| 6 | Dashboard non-working day wording conflicts with visible Needs You Today task | Medium | UX | /dashboard |
| 7 | Quick Add shows validation error immediately on open | Low | UX | /dashboard |
| 8 | Login validation exposes developer/schema wording | Low | UX / Content | /login |
| 9 | Project detail heading lacks spacing between project code and name | Low | Visual / Content | Project detail |
| 10 | Brand/project spelling inconsistency: KanBlam vs Kamblam | Low | Content | Projects |
| 11 | Date formatting is US-style and potentially ambiguous | Low | UX | Multiple |
| 12 | Some secondary text, placeholders, and empty states have low contrast | Low | Accessibility / Visual | Multiple |

---

## Testing Coverage

### Pages tested

- Public landing page
- Login page
- Authenticated dashboard / DayDash
- Tasks page
- Task detail/edit modal
- New task modal
- Quick Add modal
- Kanban page
- Calendar month view
- Eisenhower matrix
- Projects list
- Project detail overview
- Project edit modal

### Features tested

- Login with valid credentials
- Empty login validation
- Invalid login input state
- Dashboard metrics and recent activity
- Quick Add task creation
- Natural-language quick-add parsing for tag, due date, and priority-like syntax
- Task table display
- Task detail/edit modal
- Priority changes
- Important checkbox
- Description field
- Subtask creation
- Tag display/removal control visibility
- Kanban card display and empty states
- Calendar task display
- Eisenhower task placement
- Project list and project detail
- Project edit modal open/cancel
- Console checks after major navigations and interactions

### Test data created

Created task:

`QA test task from Hermes #qa due:tomorrow !low`

Observed displayed task title:

`QA test task from Hermes !low`

Observed in some views as:

`Eliminate QA test task from Hermes !low`

Created subtask:

`QA subtask one`

The beta account was explicitly approved for destructive testing by the user, but this pass did not complete deletion/cleanup flows before the session limit was reached.

### Not tested / still worth testing

- Settings page
- Tags page management flows
- User/profile menu
- Logout/session expiry
- Project delete confirmation
- Task delete confirmation
- Completed task visibility toggle behaviour
- Filter combinations: project, assignee, quadrant, tags
- Dark mode
- Calendar week view
- Responsive/mobile layout
- Keyboard-only navigation
- Screen reader pass
- Actual drag-and-drop movement between Kanban columns or Eisenhower quadrants
- Recurring task behaviour beyond observing the Repeat field in New Task
- Invite/team/member flows, if available

### Blockers

The testing pass was stopped by the tool-call iteration limit before the full planned QA scope could be completed.

---

## Recommendations

### Fix first

1. **Fix task edit persistence.** Saving a task must either persist every changed field or clearly report why a field was not saved. Silent partial saves are high-risk.
2. **Decide and document Quick Add syntax.** If `!low`, `!urgent`, etc. are supported, parse them consistently. If not, do not imply support through examples or leave these tokens in titles unexpectedly.
3. **Improve validation feedback in New Task.** Empty required fields should show visible, field-specific messages.
4. **Fix Recent Activity task links.** Clicking a task from Recent Activity should open the same task detail modal as the Tasks table.

### Then polish

5. Humanise login validation messages.
6. Fix `P01Finish...` spacing.
7. Standardise `KanBlam` / `Kamblam` spelling if the mismatch is unintentional.
8. Make dates locale-aware or unambiguous.
9. Add accessible labels/tooltips for small icons.
10. Ensure drag-and-drop has keyboard-accessible alternatives.
11. Strengthen contrast for empty states and metadata.
12. Add accessible summaries for charts/calendar/task cards.

---

## Screenshot Evidence Index

- Landing page: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_7d39f0ae7106402dbef3bc8f3224af01.png`
- Login page: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_4a2f7e544f46403dbbc5430cf755cd72.png`
- Login validation: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_6e9c61683f7b49e39a42e0023dbfd78f.png`
- Dashboard: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_96da2f922dce4354853220d6bb4a0c59.png`
- Quick Add: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_55477228b38346f8932f4de25334d281.png`
- Tasks page: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_809591cc4c68424eb3512241d6e39ca4.png`
- Kanban: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_fc9c34e5d2ee446c822603cfe9a46f8a.png`
- Calendar: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_4852b94e691248ddaf7dbda049f4b115.png`
- Eisenhower: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_fd7172717b4e4aaf8547335fd9aa7102.png`
- Project detail: `/Users/harry/.hermes/cache/screenshots/browser_screenshot_6e2422cfbc08448fb428dc66bc778953.png`
