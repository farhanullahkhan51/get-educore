import { describe, expect, it } from "vitest";
import { leaveDays, unavailableStaff, summarise, leaveDaysInRange, defaultStatus, type LeaveRow } from "./staff-hr";

const leave = (o: Partial<LeaveRow>): LeaveRow => ({ staff_id: "a", start_date: "2026-10-12", end_date: "2026-10-14", status: "approved", leave_type: "sick", ...o });

describe("staff HR rules", () => {
  it("counts leave days inclusively", () => {
    expect(leaveDays("2026-10-12", "2026-10-14")).toBe(3);
    expect(leaveDays("2026-10-12", "2026-10-12")).toBe(1);
  });

  it("approved leave makes a teacher unavailable for proxy cover", () => {
    expect(unavailableStaff("2026-10-13", [], [leave({})]).get("a")).toBe("on_leave");
  });

  it("pending or rejected leave does not remove the teacher", () => {
    expect(unavailableStaff("2026-10-13", [], [leave({ status: "pending" }), leave({ staff_id: "b", status: "rejected" })]).size).toBe(0);
  });

  it("marked absent counts even without leave; present overrides leave", () => {
    const u = unavailableStaff("2026-10-13", [{ staff_id: "b", date: "2026-10-13", status: "absent" }, { staff_id: "a", date: "2026-10-13", status: "present" }], [leave({})]);
    expect(u.get("b")).toBe("absent");
    expect(u.has("a")).toBe(false);
  });

  it("pre-fills on_leave on the daily sheet for approved leave", () => {
    expect(defaultStatus("a", "2026-10-12", [leave({})])).toBe("on_leave");
    expect(defaultStatus("a", "2026-10-15", [leave({})])).toBe("present");
  });

  it("attendance % treats late as present, half day as 0.5 and excludes leave", () => {
    const r = summarise([
      { staff_id: "a", date: "1", status: "present" },
      { staff_id: "a", date: "2", status: "late" },
      { staff_id: "a", date: "3", status: "half_day" },
      { staff_id: "a", date: "4", status: "absent" },
      { staff_id: "a", date: "5", status: "on_leave" },
    ]);
    expect(r.attendancePct).toBe(62.5);
  });

  it("clips leave days to the month", () => {
    expect(leaveDaysInRange([leave({ start_date: "2026-09-29", end_date: "2026-10-02" })], "2026-10-01", "2026-10-31")).toEqual({ sick: 2 });
  });
});
