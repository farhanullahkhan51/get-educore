import { describe, it, expect } from "vitest";
import { dueState, addDays, groupBySubject } from "./homework";

describe("homework due states", () => {
  const today = "2026-10-12";
  it("past due before today", () => expect(dueState("2026-10-11", today)).toBe("overdue"));
  it("due today", () => expect(dueState("2026-10-12", today)).toBe("today"));
  it("due tomorrow", () => expect(dueState("2026-10-13", today)).toBe("tomorrow"));
  it("upcoming later", () => expect(dueState("2026-10-20", today)).toBe("upcoming"));
  it("no due date", () => expect(dueState(null, today)).toBe("none"));
  it("addDays crosses month end", () => expect(addDays("2026-10-31", 1)).toBe("2026-11-01"));
  it("groups blank subject as General", () => {
    const g = groupBySubject([{ subject: "Math" }, { subject: "" }, { subject: "Math" }]);
    expect(g.map(([k, v]) => [k, v.length])).toEqual([["General", 1], ["Math", 2]]);
  });
});
