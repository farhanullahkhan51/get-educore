import { describe, it, expect } from "vitest";
import { guessMapping, remapRow, parseStudentRow } from "./student-import";

describe("column matching wizard", () => {
  it("guesses common school column names", () => {
    expect(guessMapping(["Roll No", "Candidate Name", "Father / Guardian", "Cell No", "Grade", "Sec", "Blood Group"]))
      .toEqual(["adm_id", "student_name", "father_name", "mobile", "class_name", "section_name", null]);
  });
  it("gives each field to only the first matching column", () => {
    expect(guessMapping(["Name", "Full Name"])).toEqual(["student_name", null]);
  });
  it("remapped rows pass the normal student checks", () => {
    const row = remapRow(["10005", "Ali Khan", "x"], ["adm_id", "student_name", null]);
    const r = parseStudentRow(row);
    expect(r.ok && r.value.student_code).toBe("10005");
    expect(r.ok && r.value.last_name).toBe("Khan");
  });
});
