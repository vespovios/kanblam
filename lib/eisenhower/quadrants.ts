export type QuadrantId = "q1" | "q2" | "q3" | "q4";

export const QUADRANT_IDS: readonly QuadrantId[] = ["q1", "q2", "q3", "q4"] as const;

export const QUADRANT_META: Record<QuadrantId, { title: string; subtitle: string }> = {
  q1: { title: "Do", subtitle: "Urgent & important" },
  q2: { title: "Schedule", subtitle: "Important, not urgent" },
  q3: { title: "Delegate", subtitle: "Urgent, not important" },
  q4: { title: "Eliminate", subtitle: "Neither" },
};

export function quadrantFlags(id: QuadrantId): { isImportant: boolean; isUrgent: boolean } {
  switch (id) {
    case "q1": return { isImportant: true, isUrgent: true };
    case "q2": return { isImportant: true, isUrgent: false };
    case "q3": return { isImportant: false, isUrgent: true };
    case "q4": return { isImportant: false, isUrgent: false };
  }
}

export function quadrantFor(flags: { isImportant: boolean; isUrgent: boolean }): QuadrantId {
  if (flags.isImportant && flags.isUrgent) return "q1";
  if (flags.isImportant) return "q2";
  if (flags.isUrgent) return "q3";
  return "q4";
}
