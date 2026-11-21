import { describe, expect, it } from "vitest";
import { accessibleSources, searchWords, slashShouldToggle } from "./system-search";

describe("system search", () => {
  it("slash opens from a page and closes while the search box has focus", () => {
    expect(slashShouldToggle({ key: "/" }, false, false, false)).toBe(true);
    expect(slashShouldToggle({ key: "/" }, true, true, true)).toBe(true);
  });
  it("does not interrupt other forms or trigger from repeated/modified keys", () => {
    expect(slashShouldToggle({ key: "/" }, false, true, false)).toBe(false);
    expect(slashShouldToggle({ key: "/" }, true, true, false)).toBe(false);
    expect(slashShouldToggle({ key: "/", repeat: true }, true, false, false)).toBe(false);
    expect(slashShouldToggle({ key: "/", ctrlKey: true }, false, false, false)).toBe(false);
  });
  it("searches only sources belonging to accessible modules", () => {
    const tables = accessibleSources(["/students", "/homework"]).map((s) => s.table);
    expect(tables).toEqual(["students", "homework_entries"]);
    expect(tables).not.toContain("fee_challans");
    expect(accessibleSources([])).toEqual([]);
  });
  it("keeps Unicode names but removes filter grammar and wildcard injection", () => {
    expect(searchWords('Ali,or(id.eq.1)%_*')).toEqual(["Ali", "or", "id", "eq", "1"]);
    expect(searchWords("علی خان")).toEqual(["علی", "خان"]);
  });
  it("lets students search portal records without adding staff or administrative sources", () => {
    const sources = accessibleSources(["/portal"]);
    expect(sources.map((s) => s.table)).toContain("fee_challans");
    expect(sources.map((s) => s.table)).not.toContain("staff_payroll");
    expect(sources.every((s) => s.to === "/portal")).toBe(true);
  });
});