export const HOMEWORK_KINDS = [
  { v: "homework", l: "Homework" },
  { v: "classwork", l: "Classwork" },
  { v: "reading", l: "Reading" },
  { v: "project", l: "Project" },
  { v: "test", l: "Test / Quiz" },
  { v: "note", l: "Note to parents" },
] as const;

export type DueState = "none" | "overdue" | "today" | "tomorrow" | "upcoming";

/** Dates are ISO yyyy-mm-dd strings (school-local). */
export function dueState(dueOn: string | null | undefined, today: string): DueState {
  if (!dueOn) return "none";
  if (dueOn < today) return "overdue";
  if (dueOn === today) return "today";
  if (dueOn === addDays(today, 1)) return "tomorrow";
  return "upcoming";
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function localToday(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const DUE_LABEL: Record<DueState, string> = {
  none: "",
  overdue: "Past due",
  today: "Due today",
  tomorrow: "Due tomorrow",
  upcoming: "Upcoming",
};

/** Group diary entries by subject, keeping subjects alphabetical. */
export function groupBySubject<T extends { subject: string }>(rows: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = r.subject?.trim() || "General";
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
