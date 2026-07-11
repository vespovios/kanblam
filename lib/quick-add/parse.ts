/** Canonical priority keyword the parser emits for the four levels.
 *  `medium` is normalized to `med` so resolvers can match a single token. */
export type PriorityKeyword = "low" | "med" | "high" | "urgent-prio";

export type ParsedQuickAdd = {
  name: string;
  projectCode: string | null;
  tagNames: string[];
  dueDateKeyword: string | null;
  assigneeToken: string | null;
  isImportant: boolean;
  isUrgent: boolean;
  /** Explicit priority-level token (`!low`, `!med`/`!medium`, `!high`).
   *  Null when the user didn't specify one. `!urgent` keeps its existing
   *  meaning as the Eisenhower urgency flag, NOT a priority level. */
  priorityKeyword: PriorityKeyword | null;
  errors: string[];
};

type Match = { start: number; end: number; kind: string; value: string };

const PROJECT_RE = /(?:^|\s)\[([A-Z][A-Z0-9_-]{0,9})\](?=\s|$)/g;
const TAG_RE = /(?:^|\s)#([A-Za-z0-9_-]+)(?=\s|$)/g;
const DUE_RE = /(?:^|\s)due:(\S+)(?=\s|$)/gi;
const ASSIGNEE_RE = /(?:^|\s)@([A-Za-z0-9._-]+)(?=\s|$)/g;
const IMPORTANT_RE = /(?:^|\s)!(important|imp)(?=\s|$)/gi;
const URGENT_RE = /(?:^|\s)!(urgent|urg)(?=\s|$)/gi;
// Priority-level token: !low, !med, !medium, !high. Deliberately ordered so
// `medium` is matched in preference to `med` (alternation is left-to-right;
// the longer form must come first or the engine stops at `med` and leaves
// `ium` in the title).
const PRIORITY_RE = /(?:^|\s)!(low|medium|med|high)(?=\s|$)/gi;

const DUE_KEYWORDS = new Set([
  "today", "tomorrow", "mon", "tue", "wed", "thu", "fri", "sat", "sun",
]);

function collect(input: string, regex: RegExp, kind: string): Match[] {
  const out: Match[] = [];
  for (const m of input.matchAll(regex)) {
    const captured = m[0];
    // Match consumed an optional leading whitespace; the actual token starts
    // at the first non-whitespace char of the match.
    const tokenStart = (m.index ?? 0) + captured.search(/\S/);
    out.push({
      start: tokenStart,
      end: (m.index ?? 0) + captured.length,
      kind,
      value: m[1],
    });
  }
  return out;
}

function stripRanges(input: string, ranges: Array<{ start: number; end: number }>): string {
  if (ranges.length === 0) return input;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let result = "";
  let cursor = 0;
  for (const r of sorted) {
    result += input.slice(cursor, r.start);
    cursor = r.end;
  }
  result += input.slice(cursor);
  return result;
}

export function parseQuickAdd(input: string): ParsedQuickAdd {
  const errors: string[] = [];

  const projectMatches = collect(input, PROJECT_RE, "project");
  const tagMatches = collect(input, TAG_RE, "tag");

  // Due regex is case-insensitive on keyword; normalize captured value to lowercase.
  const rawDueMatches = collect(input, DUE_RE, "due");
  const dueMatches = rawDueMatches.map((m) => ({ ...m, value: m.value.toLowerCase() }));

  const rawAssigneeMatches = collect(input, ASSIGNEE_RE, "assignee");
  const assigneeMatches = rawAssigneeMatches.map((m) => ({ ...m, value: m.value.toLowerCase() }));

  const importantMatches = collect(input, IMPORTANT_RE, "important");
  const urgentMatches = collect(input, URGENT_RE, "urgent");

  const rawPriorityMatches = collect(input, PRIORITY_RE, "priority");
  // Normalize: !medium → med so downstream resolvers can match a single token.
  const priorityMatches = rawPriorityMatches.map((m) => ({
    ...m,
    value: m.value.toLowerCase() === "medium" ? "med" : m.value.toLowerCase(),
  }));

  // Uniqueness checks
  if (projectMatches.length > 1) errors.push("Only one project code allowed");
  if (dueMatches.length > 1) errors.push("Only one due date allowed");
  if (assigneeMatches.length > 1) errors.push("Only one assignee allowed");
  if (priorityMatches.length > 1) errors.push("Only one priority allowed");

  // Due-keyword validation: the regex deliberately captures any \S+ after `due:`
  // so unknown keywords (e.g. `due:wednesday`) get stripped from the title and
  // raise a parse error here rather than silently passing through. ISO dates are
  // shape-checked only; full calendar validity (e.g. 2026-02-30) lives in resolve.
  for (const m of dueMatches) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.value) && !DUE_KEYWORDS.has(m.value)) {
      errors.push(
        `Unknown due date '${m.value}' — try today, tomorrow, mon..sun, or YYYY-MM-DD`,
      );
    }
  }

  // Strip every match from the input string.
  const allMatches: Match[] = [
    ...projectMatches,
    ...tagMatches,
    ...dueMatches,
    ...assigneeMatches,
    ...importantMatches,
    ...urgentMatches,
    ...priorityMatches,
  ];
  const stripped = stripRanges(input, allMatches);
  const name = stripped.replace(/\s+/g, " ").trim();

  if (name === "") errors.push("Task needs a name");

  // De-dup tag names case-insensitively, keeping first-occurrence casing.
  const seen = new Set<string>();
  const tagNames: string[] = [];
  for (const m of tagMatches) {
    const lower = m.value.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      tagNames.push(m.value);
    }
  }

  return {
    name,
    projectCode: projectMatches[0]?.value ?? null,
    tagNames,
    dueDateKeyword: dueMatches[0]?.value ?? null,
    assigneeToken: assigneeMatches[0]?.value ?? null,
    isImportant: importantMatches.length > 0,
    isUrgent: urgentMatches.length > 0,
    priorityKeyword: (priorityMatches[0]?.value as PriorityKeyword | undefined) ?? null,
    errors,
  };
}
