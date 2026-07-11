import { describe, it, expect } from "vitest";
import {
  computeLanes,
  groupByStageAndLane,
  untaggedTaskCount,
  type LaneAxis,
  type LaneInputTask,
} from "@/lib/kanban/lanes";

const M = (id: string, name: string | null, email = `${id}@x`) => ({ id, name, email });
const T = (id: string, color = "#fff") => ({ id, name: id, color });
const P = (id: string, code: string, name: string) => ({ id, code, name });
const stages = [{ id: "s1", name: "Backlog" }, { id: "s2", name: "Doing" }];

function task(overrides: Partial<LaneInputTask>): LaneInputTask {
  return {
    id: "t1",
    kanbanStageId: "s1",
    kanbanOrder: 0,
    assignee: null,
    tags: [],
    project: { id: "p1" },
    ...overrides,
  };
}

describe("computeLanes", () => {
  it("assignee axis: one lane per member, sorted by name asc", () => {
    const lanes = computeLanes("assignee", [M("u1", "Carol"), M("u2", "Alice"), M("u3", "Bob")], [], []);
    expect(lanes.map((l) => l.id)).toEqual(["u2", "u3", "u1"]);
    expect(lanes.map((l) => l.label)).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("assignee axis: null name falls back to email", () => {
    const lanes = computeLanes("assignee", [M("u1", null, "zed@x"), M("u2", "Alice")], [], []);
    expect(lanes.map((l) => l.label)).toEqual(["Alice", "zed@x"]);
  });

  it("assignee axis: equal-name members tiebreak by id (stable React keys)", () => {
    const lanes = computeLanes("assignee", [M("u2", "Alice"), M("u1", "Alice")], [], []);
    expect(lanes.map((l) => l.id)).toEqual(["u1", "u2"]);
  });

  it("tag axis: one lane per tag, sorted by name asc", () => {
    const lanes = computeLanes("tag", [], [T("t1"), T("t2")], []);
    expect(lanes.map((l) => l.id)).toEqual(["t1", "t2"]);
  });

  it("project axis: code is the label, name is the sublabel, sorted by code", () => {
    const lanes = computeLanes("project", [], [], [
      P("p1", "WEB", "Website"),
      P("p2", "APP", "Mobile App"),
    ]);
    // Sorted by label (= code): "APP" < "WEB"
    expect(lanes.map((l) => l.id)).toEqual(["p2", "p1"]);
    expect(lanes.map((l) => l.label)).toEqual(["APP", "WEB"]);
    expect(lanes.map((l) => l.sublabel)).toEqual(["Mobile App", "Website"]);
  });

  it("project axis: equal-code projects tiebreak by id", () => {
    const lanes = computeLanes("project", [], [], [
      P("p2", "WEB", "Website"),
      P("p1", "WEB", "Website"),
    ]);
    expect(lanes.map((l) => l.id)).toEqual(["p1", "p2"]);
  });

  it("assignee / tag lanes carry no sublabel", () => {
    const aLanes = computeLanes("assignee", [M("u1", "Alice")], [], []);
    const tLanes = computeLanes("tag", [], [T("t1")], []);
    expect(aLanes[0].sublabel).toBeUndefined();
    expect(tLanes[0].sublabel).toBeUndefined();
  });

  it("none axis: returns empty array", () => {
    const lanes = computeLanes("none" as LaneAxis, [M("u1", "Alice")], [T("t1")], [P("p1", "X", "X")]);
    expect(lanes).toEqual([]);
  });

  it("empty members + assignee axis: returns empty array", () => {
    expect(computeLanes("assignee", [], [], [])).toEqual([]);
  });

  it("empty tags + tag axis: returns empty array", () => {
    expect(computeLanes("tag", [M("u1", "A")], [], [])).toEqual([]);
  });

  it("empty projects + project axis: returns empty array", () => {
    expect(computeLanes("project", [], [], [])).toEqual([]);
  });
});

describe("groupByStageAndLane", () => {
  const lanesAssignee = [
    { id: "u1", label: "Alice" },
    { id: "u2", label: "Bob" },
  ];
  const lanesTag = [
    { id: "t1", label: "urgent" },
    { id: "t2", label: "blocked" },
  ];
  const lanesProject = [
    { id: "p1", label: "WEB — Website" },
    { id: "p2", label: "APP — Mobile App" },
  ];

  it("assignee axis: task lands in its assignee's lane only", () => {
    const t = task({ id: "x", assignee: { id: "u1" } });
    const grouped = groupByStageAndLane([t], stages, lanesAssignee, "assignee");
    expect(grouped.get("s1::u1")?.map((c) => c.id)).toEqual(["x"]);
    expect(grouped.get("s1::u2") ?? []).toEqual([]);
  });

  it("tag axis: single-tag task lands in its tag's lane only", () => {
    const t = task({ id: "x", tags: [T("t1")] });
    const grouped = groupByStageAndLane([t], stages, lanesTag, "tag");
    expect(grouped.get("s1::t1")?.map((c) => c.id)).toEqual(["x"]);
    expect(grouped.get("s1::t2") ?? []).toEqual([]);
  });

  it("tag axis: multi-tag task is duplicated across each tag-lane", () => {
    const t = task({ id: "x", tags: [T("t1"), T("t2")] });
    const grouped = groupByStageAndLane([t], stages, lanesTag, "tag");
    expect(grouped.get("s1::t1")?.map((c) => c.id)).toEqual(["x"]);
    expect(grouped.get("s1::t2")?.map((c) => c.id)).toEqual(["x"]);
  });

  it("tag axis: untagged task is excluded from all cells", () => {
    const t = task({ id: "x", tags: [] });
    const grouped = groupByStageAndLane([t], stages, lanesTag, "tag");
    for (const list of grouped.values()) {
      expect(list.find((c) => c.id === "x")).toBeUndefined();
    }
  });

  it("project axis: task lands in its project's lane only", () => {
    const t = task({ id: "x", project: { id: "p1" } });
    const grouped = groupByStageAndLane([t], stages, lanesProject, "project");
    expect(grouped.get("s1::p1")?.map((c) => c.id)).toEqual(["x"]);
    expect(grouped.get("s1::p2") ?? []).toEqual([]);
  });

  it("project axis: task whose project isn't in the lane set is excluded", () => {
    const t = task({ id: "x", project: { id: "stranger" } });
    const grouped = groupByStageAndLane([t], stages, lanesProject, "project");
    for (const list of grouped.values()) {
      expect(list.find((c) => c.id === "x")).toBeUndefined();
    }
  });

  it("assignee axis: task with assignee in another workspace's set is excluded", () => {
    const t = task({ id: "x", assignee: { id: "stranger" } });
    const grouped = groupByStageAndLane([t], stages, lanesAssignee, "assignee");
    for (const list of grouped.values()) {
      expect(list.find((c) => c.id === "x")).toBeUndefined();
    }
  });

  it("respects kanbanOrder ascending within each cell", () => {
    const t1 = task({ id: "first", assignee: { id: "u1" }, kanbanOrder: 5 });
    const t2 = task({ id: "second", assignee: { id: "u1" }, kanbanOrder: 1 });
    const grouped = groupByStageAndLane([t1, t2], stages, lanesAssignee, "assignee");
    expect(grouped.get("s1::u1")?.map((c) => c.id)).toEqual(["second", "first"]);
  });
});

describe("untaggedTaskCount", () => {
  it("counts tasks with no tags when axis is tag", () => {
    const tasks = [task({ id: "a", tags: [] }), task({ id: "b", tags: [T("t1")] }), task({ id: "c", tags: [] })];
    expect(untaggedTaskCount(tasks, "tag")).toBe(2);
  });

  it("returns 0 when axis is not tag", () => {
    const tasks = [task({ id: "a", tags: [] })];
    expect(untaggedTaskCount(tasks, "assignee")).toBe(0);
    expect(untaggedTaskCount(tasks, "project")).toBe(0);
    expect(untaggedTaskCount(tasks, "none" as LaneAxis)).toBe(0);
  });
});
