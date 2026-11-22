import { describe, it, expect } from "vitest";
import { parseStudentRow, canonicalRow } from "./student-import";
import { classesForSystem, sectionsForClass } from "./class-sections";

const base = { "Student Name": "Ali Khan" };

describe("student import", () => {
  it("rejects an Adm. ID that is not 5 digits", () => {
    expect(parseStudentRow({ ...base, "Adm. ID": "1234" }).ok).toBe(false);
    expect(parseStudentRow({ ...base, "Adm. ID": "12a45" }).ok).toBe(false);
    expect(parseStudentRow({ ...base, "Adm. ID": "12345" }).ok).toBe(true);
  });
  it("reads DD/MM/YYYY dates and rejects impossible ones", () => {
    const r = parseStudentRow({ ...base, DOB: "05/03/2015" });
    expect(r.ok && r.value.date_of_birth).toBe("2015-03-05");
    expect(parseStudentRow({ ...base, DOB: "31/02/2015" }).ok).toBe(false);
  });
  it("requires 13-digit father CNIC", () => {
    const r = parseStudentRow({ ...base, "Father's CNIC Number": "3520212345671" });
    expect(r.ok && r.value.father_cnic).toBe("35202-1234567-1");
    expect(parseStudentRow({ ...base, "Father's CNIC Number": "35202-12345" }).ok).toBe(false);
  });
  it("uses the first filled Fee column", () => {
    expect(canonicalRow({ Fee: "4,500", "Fee ": "9000" })["fee"]).toBe("4,500");
    const r = parseStudentRow({ ...base, Fee: "Rs. 4,500" });
    expect(r.ok && r.value.monthly_fee).toBe(4500);
  });
});

describe("class and section pickers", () => {
  const classes = [
    { id: "b7", name: "Grade 7", academic_system: "board" as const },
    { id: "c7", name: "Grade 7", academic_system: "cambridge" as const },
  ];
  const sections = [
    { id: "s1", name: "A", class_id: "b7" },
    { id: "s2", name: "B", class_id: "c7" },
  ];
  it("shows only board classes for a board student", () => {
    expect(classesForSystem(classes, "board").map((c) => c.id)).toEqual(["b7"]);
  });
  it("shows board then cambridge classes for both", () => {
    expect(classesForSystem(classes, "both").map((c) => c.id)).toEqual(["b7", "c7"]);
  });
  it("shows only the chosen grade's sections", () => {
    expect(sectionsForClass(sections, "b7").map((s) => s.id)).toEqual(["s1"]);
    expect(sectionsForClass(sections, null)).toEqual([]);
  });
});
