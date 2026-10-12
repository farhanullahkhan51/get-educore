/** Pure helpers for staff attendance & leave. */

export type StaffAttStatus = "present" | "absent" | "late" | "half_day" | "on_leave";
export type AttRow = { staff_id: string; date: string; status: StaffAttStatus };
export type LeaveRow = { staff_id: string; start_date: string; end_date: string; status: string; leave_type: string };

/** Inclusive number of calendar days in a leave. */
export function leaveDays(start: string, end: string) {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return ms < 0 ? 0 : Math.round(ms / 86_400_000) + 1;
}

export const leaveCovers = (l: LeaveRow, date: string) =>
  l.status === "approved" && l.start_date <= date && l.end_date >= date;

/**
 * Staff who will NOT teach on the date: marked absent/on leave, or holding an
 * approved leave covering it. A "present"/"late"/"half_day" mark overrides a leave
 * (the teacher came in after all).
 */
export function unavailableStaff(date: string, att: AttRow[], leaves: LeaveRow[]) {
  const marks = new Map(att.filter((a) => a.date === date).map((a) => [a.staff_id, a.status]));
  const out = new Map<string, "absent" | "on_leave">();
  for (const l of leaves) if (leaveCovers(l, date)) out.set(l.staff_id, "on_leave");
  for (const [id, s] of marks) {
    if (s === "absent") out.set(id, "absent");
    else if (s === "on_leave") out.set(id, "on_leave");
    else out.delete(id);
  }
  return out;
}

/** Status to pre-fill on the daily sheet when nothing is marked yet. */
export function defaultStatus(staffId: string, date: string, leaves: LeaveRow[]): StaffAttStatus {
  return leaves.some((l) => l.staff_id === staffId && leaveCovers(l, date)) ? "on_leave" : "present";
}

export type MonthSummary = { present: number; late: number; half_day: number; absent: number; on_leave: number; marked: number; attendancePct: number | null };

/** Present + late count as full days, half_day as 0.5; leave days excluded from the denominator. */
export function summarise(rows: AttRow[]): MonthSummary {
  const s = { present: 0, late: 0, half_day: 0, absent: 0, on_leave: 0 };
  for (const r of rows) s[r.status]++;
  const working = s.present + s.late + s.half_day + s.absent;
  const attended = s.present + s.late + s.half_day * 0.5;
  return { ...s, marked: rows.length, attendancePct: working ? Math.round((attended / working) * 1000) / 10 : null };
}

/** Approved leave days per type that fall inside [from, to]. */
export function leaveDaysInRange(leaves: LeaveRow[], from: string, to: string) {
  const out: Record<string, number> = {};
  for (const l of leaves) {
    if (l.status !== "approved") continue;
    const s = l.start_date > from ? l.start_date : from;
    const e = l.end_date < to ? l.end_date : to;
    const d = leaveDays(s, e);
    if (d > 0 && s <= e) out[l.leave_type] = (out[l.leave_type] ?? 0) + d;
  }
  return out;
}
