import type { ParsedQuickAdd } from "./parse";
import { resolveDueKeyword } from "./dates";

export type PreviewContext = {
  defaultProjectCode: string | null; // shown when parsed.projectCode is null
  now: Date;
};

const SHORT_WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTH = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function humanDate(d: Date): string {
  return `${SHORT_WEEKDAY[d.getUTCDay()]} ${SHORT_MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function formatPreview(parsed: ParsedQuickAdd, ctx: PreviewContext): string {
  if (
    parsed.name === "" &&
    !parsed.projectCode &&
    parsed.tagNames.length === 0 &&
    !parsed.dueDateKeyword &&
    !parsed.assigneeToken &&
    !parsed.isImportant &&
    !parsed.isUrgent &&
    !parsed.priorityKeyword
  ) {
    return "";
  }

  const parts: string[] = [`"${parsed.name}"`];

  const code = parsed.projectCode ?? ctx.defaultProjectCode;
  if (code) parts.push(code);

  for (const t of parsed.tagNames) parts.push(`#${t}`);

  if (parsed.dueDateKeyword) {
    const resolved = resolveDueKeyword(parsed.dueDateKeyword, ctx.now);
    if (resolved) parts.push(`due ${humanDate(resolved)}`);
  }

  if (parsed.assigneeToken) parts.push(`@${parsed.assigneeToken}`);
  if (parsed.priorityKeyword) parts.push(`!${parsed.priorityKeyword}`);
  if (parsed.isImportant) parts.push("!important");
  if (parsed.isUrgent) parts.push("!urgent");

  return `→ ${parts.join(" · ")}`;
}
