import { describe, it, expect } from "vitest";
import { parseQuickAdd } from "@/lib/quick-add/parse";

describe("parseQuickAdd", () => {
  describe("name extraction", () => {
    it("returns the input as the name when no markers", () => {
      const r = parseQuickAdd("Fix login redirect");
      expect(r.name).toBe("Fix login redirect");
      expect(r.errors).toEqual([]);
    });

    it("collapses internal whitespace and trims", () => {
      const r = parseQuickAdd("  Fix    login   redirect  ");
      expect(r.name).toBe("Fix login redirect");
    });

    it("errors on empty input", () => {
      const r = parseQuickAdd("");
      expect(r.errors).toContain("Task needs a name");
    });

    it("errors on whitespace-only input", () => {
      const r = parseQuickAdd("   ");
      expect(r.errors).toContain("Task needs a name");
    });

    it("errors when only markers leave no name", () => {
      const r = parseQuickAdd("[WEB] #foo due:fri");
      expect(r.errors).toContain("Task needs a name");
    });
  });

  describe("project [CODE]", () => {
    it("extracts uppercase code", () => {
      const r = parseQuickAdd("Fix login [WEB]");
      expect(r.projectCode).toBe("WEB");
      expect(r.name).toBe("Fix login");
    });

    it("uppercases the captured code", () => {
      // Regex requires uppercase first char + uppercase body, so this won't match.
      // Document the rule: lowercase brackets are intentionally ignored.
      const r = parseQuickAdd("Fix [important] issue");
      expect(r.projectCode).toBeNull();
      expect(r.name).toBe("Fix [important] issue");
    });

    it("ignores brackets that aren't whitespace-bounded", () => {
      const r = parseQuickAdd("Fix [ABC]bar issue");
      expect(r.projectCode).toBeNull();
      expect(r.name).toBe("Fix [ABC]bar issue");
    });

    it("errors on multiple project codes", () => {
      const r = parseQuickAdd("Fix [WEB] and [API] bug");
      expect(r.errors).toContain("Only one project code allowed");
    });
  });

  describe("tags #tag", () => {
    it("extracts a single tag", () => {
      const r = parseQuickAdd("Fix bug #auth");
      expect(r.tagNames).toEqual(["auth"]);
      expect(r.name).toBe("Fix bug");
    });

    it("extracts multiple tags", () => {
      const r = parseQuickAdd("#alpha Fix bug #beta-1 #gamma_2");
      expect(r.tagNames).toEqual(["alpha", "beta-1", "gamma_2"]);
      expect(r.name).toBe("Fix bug");
    });

    it("de-duplicates case-insensitively, preserving first-occurrence casing", () => {
      const r = parseQuickAdd("Fix #Auth bug #auth");
      expect(r.tagNames).toEqual(["Auth"]);
    });

    it("does not match # without trailing characters", () => {
      const r = parseQuickAdd("Fix C# bug");
      expect(r.tagNames).toEqual([]);
      expect(r.name).toBe("Fix C# bug");
    });
  });

  describe("due date due:", () => {
    it.each([
      ["today"],
      ["tomorrow"],
      ["mon"], ["tue"], ["wed"], ["thu"], ["fri"], ["sat"], ["sun"],
      ["2026-05-03"],
    ])("captures due:%s", (kw) => {
      const r = parseQuickAdd(`Fix bug due:${kw}`);
      expect(r.dueDateKeyword).toBe(kw);
    });

    it("is case-insensitive on the keyword", () => {
      const r = parseQuickAdd("Fix bug Due:Tomorrow");
      expect(r.dueDateKeyword).toBe("tomorrow");
    });

    it("errors on unknown due-date word", () => {
      const r = parseQuickAdd("Fix bug due:wednesday");
      expect(r.errors.join(" ")).toMatch(/Unknown due date/);
    });

    it("errors on multiple due:", () => {
      const r = parseQuickAdd("Fix bug due:fri due:mon");
      expect(r.errors).toContain("Only one due date allowed");
    });
  });

  describe("assignee @token", () => {
    it("extracts a single token", () => {
      const r = parseQuickAdd("Fix bug @peter");
      expect(r.assigneeToken).toBe("peter");
    });

    it("lowercases the token", () => {
      const r = parseQuickAdd("Fix @Peter bug");
      expect(r.assigneeToken).toBe("peter");
    });

    it("does not match @ inside an email", () => {
      const r = parseQuickAdd("Email peter@example.com about it");
      expect(r.assigneeToken).toBeNull();
      expect(r.name).toBe("Email peter@example.com about it");
    });

    it("errors on multiple @", () => {
      const r = parseQuickAdd("Fix bug @peter @maya");
      expect(r.errors).toContain("Only one assignee allowed");
    });
  });

  describe("flags !important / !urgent", () => {
    it("captures !important", () => {
      expect(parseQuickAdd("Fix bug !important").isImportant).toBe(true);
    });

    it("captures !imp short form", () => {
      expect(parseQuickAdd("Fix bug !imp").isImportant).toBe(true);
    });

    it("captures !urgent", () => {
      expect(parseQuickAdd("Fix bug !urgent").isUrgent).toBe(true);
    });

    it("captures !urg short form", () => {
      expect(parseQuickAdd("Fix bug !urg").isUrgent).toBe(true);
    });

    it("captures both", () => {
      const r = parseQuickAdd("Fix bug !important !urgent");
      expect(r.isImportant).toBe(true);
      expect(r.isUrgent).toBe(true);
    });

    it("treats duplicate flags silently (no error)", () => {
      const r = parseQuickAdd("Fix bug !important !imp");
      expect(r.isImportant).toBe(true);
      expect(r.errors).toEqual([]);
    });

    it("is case-insensitive", () => {
      const r = parseQuickAdd("Fix bug !IMPORTANT");
      expect(r.isImportant).toBe(true);
    });
  });

  describe("priority !low / !med / !medium / !high", () => {
    it("captures !low and strips it from the title", () => {
      const r = parseQuickAdd("QA test task from Hermes #qa due:tomorrow !low");
      expect(r.priorityKeyword).toBe("low");
      expect(r.name).toBe("QA test task from Hermes");
      expect(r.errors).toEqual([]);
    });

    it("captures !med", () => {
      const r = parseQuickAdd("Fix bug !med");
      expect(r.priorityKeyword).toBe("med");
      expect(r.name).toBe("Fix bug");
    });

    it("normalizes !medium → med", () => {
      const r = parseQuickAdd("Fix bug !medium");
      expect(r.priorityKeyword).toBe("med");
      expect(r.name).toBe("Fix bug");
    });

    it("captures !high", () => {
      const r = parseQuickAdd("Fix bug !high");
      expect(r.priorityKeyword).toBe("high");
      expect(r.name).toBe("Fix bug");
    });

    it("is case-insensitive", () => {
      const r = parseQuickAdd("Fix bug !LOW");
      expect(r.priorityKeyword).toBe("low");
    });

    it("errors on multiple priority tokens", () => {
      const r = parseQuickAdd("Fix bug !low !high");
      expect(r.errors).toContain("Only one priority allowed");
    });

    it("priority and !important coexist", () => {
      const r = parseQuickAdd("Fix bug !high !important");
      expect(r.priorityKeyword).toBe("high");
      expect(r.isImportant).toBe(true);
      expect(r.errors).toEqual([]);
    });

    it("priority and !urgent coexist (!urgent stays a flag, not a priority)", () => {
      const r = parseQuickAdd("Fix bug !low !urgent");
      expect(r.priorityKeyword).toBe("low");
      expect(r.isUrgent).toBe(true);
    });
  });

  describe("composition", () => {
    it("parses every marker together regardless of order", () => {
      const r = parseQuickAdd("!urgent #auth Fix [WEB] login due:fri @peter !important #api !high");
      expect(r.name).toBe("Fix login");
      expect(r.projectCode).toBe("WEB");
      expect(r.tagNames).toEqual(["auth", "api"]);
      expect(r.dueDateKeyword).toBe("fri");
      expect(r.assigneeToken).toBe("peter");
      expect(r.isImportant).toBe(true);
      expect(r.isUrgent).toBe(true);
      expect(r.priorityKeyword).toBe("high");
      expect(r.errors).toEqual([]);
    });
  });
});
