import { describe, it, expect } from "vitest";
import { buildImportPlan, type AsanaProjectData, type AsanaTask } from "@/lib/import/asana-plan";

function mkTask(name: string, completed = false, subs = 0): AsanaTask {
  return {
    name,
    notes: "",
    completed,
    dueOn: null,
    startOn: null,
    section: "",
    subtasks: Array.from({ length: subs }, (_, i) => ({
      title: `sub${i}`,
      completed: false,
    })),
  };
}

const data: AsanaProjectData = {
  projectName: "Little Craft Shop",
  sections: [
    { name: "Sublimation - To Do", tasks: [mkTask("Mug designs"), mkTask("Coasters", true)] },
    { name: "Crafts - To Do", tasks: [mkTask("Party hats", false, 2)] },
    { name: "Empty Section", tasks: [] },
  ],
};

describe("buildImportPlan — sections-as-projects", () => {
  const plan = buildImportPlan(data, "sections-as-projects");

  it("creates one project per non-empty section", () => {
    expect(plan.projects.map((p) => p.name)).toEqual(["Sublimation", "Crafts"]);
  });

  it("strips the ' - To Do' suffix from section names", () => {
    expect(plan.projects[0].name).toBe("Sublimation");
  });

  it("skips empty sections", () => {
    expect(plan.projects.find((p) => p.name === "Empty Section")).toBeUndefined();
  });

  it("attaches no section tags", () => {
    expect(plan.tags).toEqual([]);
    expect(
      plan.projects.every((p) => p.tasks.every((t) => t.sectionTag === null)),
    ).toBe(true);
  });

  it("counts tasks and subtasks", () => {
    expect(plan.totalTasks).toBe(3);
    expect(plan.totalSubtasks).toBe(2);
  });
});

describe("buildImportPlan — one-project", () => {
  const plan = buildImportPlan(data, "one-project");

  it("creates a single project named after the Asana project", () => {
    expect(plan.projects).toHaveLength(1);
    expect(plan.projects[0].name).toBe("Little Craft Shop");
  });

  it("tags every task with its tidied section name", () => {
    const tags = plan.projects[0].tasks.map((t) => t.sectionTag);
    expect(tags).toEqual(["Sublimation", "Sublimation", "Crafts"]);
  });

  it("lists the distinct section tags to create", () => {
    expect(plan.tags).toEqual(["Sublimation", "Crafts"]);
  });

  it("puts every task under the one project", () => {
    expect(plan.projects[0].tasks).toHaveLength(3);
    expect(plan.totalTasks).toBe(3);
  });
});

describe("buildImportPlan — task fields", () => {
  it("carries the completed flag and keeps non-empty notes as the description", () => {
    const d: AsanaProjectData = {
      projectName: "P",
      sections: [{ name: "S", tasks: [{ ...mkTask("T", true), notes: "hello" }] }],
    };
    const t = buildImportPlan(d, "sections-as-projects").projects[0].tasks[0];
    expect(t.completed).toBe(true);
    expect(t.description).toBe("hello");
  });

  it("nulls an empty (or whitespace-only) description", () => {
    const t = buildImportPlan(data, "sections-as-projects").projects[0].tasks[0];
    expect(t.description).toBeNull();
  });
});
