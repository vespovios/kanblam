export type LaneAxis = "none" | "assignee" | "tag" | "project";

export interface Lane {
  id: string;
  /** Primary label — the person/tag name, or the project CODE. */
  label: string;
  /** Optional secondary line shown beneath the label. Project lanes use
   *  it for the project name (label = code); assignee/tag lanes leave it
   *  undefined. */
  sublabel?: string;
}

export interface LaneInputMember {
  id: string;
  name: string | null;
  email: string;
}

export interface LaneInputTag {
  id: string;
  name: string;
  color: string;
}

export interface LaneInputProject {
  id: string;
  name: string;
  code: string;
}

export interface LaneInputTask {
  id: string;
  kanbanStageId: string;
  kanbanOrder: number;
  assignee: { id: string } | null;
  tags: LaneInputTag[];
  project: { id: string };
}

export interface LaneInputStage {
  id: string;
  name: string;
}

/** Lookup key for the (stage, lane) cell. */
export const cellKey = (stageId: string, laneId: string): string =>
  `${stageId}::${laneId}`;

/**
 * Build the lane list for the given axis. Members are labeled by name (or
 * email if name is null); tags by their name; projects by CODE with the
 * project name carried as `sublabel` (rendered as a second line). All sort
 * alphabetically asc with id as a tiebreaker for stable React keys.
 */
export function computeLanes(
  axis: LaneAxis,
  members: LaneInputMember[],
  tags: LaneInputTag[],
  projects: LaneInputProject[],
): Lane[] {
  if (axis === "none") return [];
  if (axis === "assignee") {
    return members
      .map((m) => ({ id: m.id, label: m.name ?? m.email }))
      .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  }
  if (axis === "tag") {
    return tags
      .map((t) => ({ id: t.id, label: t.name }))
      .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  }
  // axis === "project" — sort by CODE (the primary label).
  return projects
    .map((p) => ({ id: p.id, label: p.code, sublabel: p.name }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

/**
 * Group tasks by (stage, lane). Multi-tag tasks appear in multiple tag-lane
 * cells. In assignee/project mode each task lands in exactly one lane (or
 * none, for an assignee not in the workspace member list). Tasks whose lane
 * axis value isn't in the lane set are excluded. Within each cell, tasks are
 * ordered by kanbanOrder asc.
 */
export function groupByStageAndLane<T extends LaneInputTask>(
  tasks: T[],
  stages: LaneInputStage[],
  lanes: Lane[],
  axis: LaneAxis,
): Map<string, T[]> {
  const out = new Map<string, T[]>();
  const stageIds = new Set(stages.map((s) => s.id));
  const laneIds = new Set(lanes.map((l) => l.id));

  // Pre-seed every (stage, lane) cell so callers can read empties without
  // null checks.
  for (const s of stages) for (const l of lanes) out.set(cellKey(s.id, l.id), []);

  for (const t of tasks) {
    if (!stageIds.has(t.kanbanStageId)) continue;
    if (axis === "assignee") {
      const aid = t.assignee?.id;
      if (!aid || !laneIds.has(aid)) continue;
      out.get(cellKey(t.kanbanStageId, aid))!.push(t);
    } else if (axis === "tag") {
      for (const tag of t.tags) {
        if (!laneIds.has(tag.id)) continue;
        out.get(cellKey(t.kanbanStageId, tag.id))!.push(t);
      }
    } else if (axis === "project") {
      const pid = t.project.id;
      if (!laneIds.has(pid)) continue;
      out.get(cellKey(t.kanbanStageId, pid))!.push(t);
    }
  }

  for (const list of out.values()) list.sort((a, b) => a.kanbanOrder - b.kanbanOrder);
  return out;
}

/**
 * Count tasks with no tags. Returns 0 when the axis is not "tag" — the banner
 * only renders in tag mode.
 */
export function untaggedTaskCount(tasks: LaneInputTask[], axis: LaneAxis): number {
  if (axis !== "tag") return 0;
  return tasks.filter((t) => t.tags.length === 0).length;
}
