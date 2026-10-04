/**
 * Timetable optimisation engine — pure logic + a loader that works with any
 * Supabase client (browser, MCP user token, or assistant). RLS always applies.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]; // day_of_week: 0=Monday … 6=Sunday

export type TTPeriod = { id: string; campus_id: string; day_of_week: number; period_number: number; start_time: string; end_time: string; is_break: boolean; label: string | null };
export type TTEntry = { id: string; section_id: string; period_id: string; course_id: string | null; teacher_id: string | null; room: string | null };
export type TTAssignment = { section_id: string; course_id: string; teacher_id: string };
export type TTData = {
  campusId: string;
  periods: TTPeriod[];
  entries: TTEntry[];
  assignments: TTAssignment[];
  sections: Map<string, string>;
  courses: Map<string, string>;
  teachers: Map<string, string>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export async function resolveCampus(sb: AnyClient, campusId?: string | null): Promise<string | null> {
  if (campusId) return campusId;
  const { data } = await sb.from("campuses").select("id").order("name").limit(1);
  return (data?.[0]?.id as string | undefined) ?? null;
}

export async function loadTimetable(sb: AnyClient, campusId: string): Promise<TTData> {
  const [p, e, a, s, c, t] = await Promise.all([
    sb.from("timetable_periods").select("id, campus_id, day_of_week, period_number, start_time, end_time, is_break, label").eq("campus_id", campusId).order("day_of_week").order("period_number"),
    sb.from("timetable_entries").select("id, section_id, period_id, course_id, teacher_id, room").eq("campus_id", campusId),
    sb.from("course_assignments").select("section_id, course_id, teacher_id").eq("campus_id", campusId),
    sb.from("sections").select("id, name, classes(name)").eq("campus_id", campusId),
    sb.from("courses").select("id, title, code").eq("campus_id", campusId),
    sb.from("staff").select("id, first_name, last_name").eq("campus_id", campusId),
  ]);
  const err = p.error ?? e.error ?? a.error ?? s.error ?? c.error ?? t.error;
  if (err) throw new Error(err.message);
  return {
    campusId,
    periods: (p.data ?? []) as TTPeriod[],
    entries: (e.data ?? []) as TTEntry[],
    assignments: (a.data ?? []) as TTAssignment[],
    sections: new Map(((s.data ?? []) as unknown as { id: string; name: string; classes: { name: string } | null }[]).map((x) => [x.id, `${x.classes?.name ?? ""} ${x.name}`.trim()])),
    courses: new Map(((c.data ?? []) as { id: string; title: string; code: string }[]).map((x) => [x.id, x.title || x.code])),
    teachers: new Map(((t.data ?? []) as { id: string; first_name: string; last_name: string }[]).map((x) => [x.id, `${x.first_name} ${x.last_name}`])),
  };
}

const slotLabel = (p: TTPeriod) => `${DAY_NAMES[p.day_of_week] ?? p.day_of_week} P${p.period_number} (${p.start_time.slice(0, 5)}–${p.end_time.slice(0, 5)})`;

export type Clash = { kind: "teacher" | "room" | "break" | "fatigue" | "unscheduled"; message: string; slot?: string };

export function analyzeClashes(d: TTData, opts: { maxDailyPeriods?: number; sectionId?: string; teacherId?: string } = {}) {
  const max = opts.maxDailyPeriods ?? 6;
  const pById = new Map(d.periods.map((p) => [p.id, p]));
  const entries = d.entries.filter((e) => (!opts.sectionId || e.section_id === opts.sectionId) || (opts.teacherId && e.teacher_id === opts.teacherId));
  const clashes: Clash[] = [];
  const byTeacherSlot = new Map<string, TTEntry[]>();
  const byRoomSlot = new Map<string, TTEntry[]>();
  const daily = new Map<string, number>();
  for (const e of d.entries) {
    const p = pById.get(e.period_id);
    if (!p) continue;
    if (e.teacher_id) {
      const k = `${e.teacher_id}|${p.day_of_week}|${p.period_number}`;
      byTeacherSlot.set(k, [...(byTeacherSlot.get(k) ?? []), e]);
      const dk = `${e.teacher_id}|${p.day_of_week}`;
      daily.set(dk, (daily.get(dk) ?? 0) + 1);
    }
    if (e.room?.trim()) {
      const k = `${e.room.trim().toLowerCase()}|${p.day_of_week}|${p.period_number}`;
      byRoomSlot.set(k, [...(byRoomSlot.get(k) ?? []), e]);
    }
  }
  const inScope = (list: TTEntry[]) => list.some((e) => entries.includes(e));
  for (const list of byTeacherSlot.values()) {
    if (list.length > 1 && inScope(list)) {
      const p = pById.get(list[0].period_id)!;
      clashes.push({ kind: "teacher", slot: slotLabel(p), message: `${d.teachers.get(list[0].teacher_id!) ?? "Teacher"} is booked in ${list.map((e) => d.sections.get(e.section_id) ?? "a section").join(" and ")} at ${slotLabel(p)}.` });
    }
  }
  for (const list of byRoomSlot.values()) {
    if (list.length > 1 && inScope(list)) {
      const p = pById.get(list[0].period_id)!;
      clashes.push({ kind: "room", slot: slotLabel(p), message: `Room ${list[0].room} is double-booked at ${slotLabel(p)}.` });
    }
  }
  for (const e of entries) {
    const p = pById.get(e.period_id);
    if (p?.is_break && (e.course_id || e.teacher_id)) clashes.push({ kind: "break", slot: slotLabel(p), message: `${d.sections.get(e.section_id) ?? "A section"} has a lesson during a break (${slotLabel(p)}).` });
  }
  for (const [k, n] of daily) {
    const [tid, day] = k.split("|");
    if (n > max && (!opts.teacherId || tid === opts.teacherId)) clashes.push({ kind: "fatigue", message: `${d.teachers.get(tid) ?? "Teacher"} teaches ${n} periods on ${DAY_NAMES[Number(day)]} (limit ${max}).` });
  }
  const scheduled = new Set(d.entries.map((e) => `${e.section_id}|${e.course_id}`));
  for (const a of d.assignments) {
    if (opts.sectionId && a.section_id !== opts.sectionId) continue;
    if (opts.teacherId && a.teacher_id !== opts.teacherId) continue;
    if (!scheduled.has(`${a.section_id}|${a.course_id}`)) clashes.push({ kind: "unscheduled", message: `${d.courses.get(a.course_id) ?? "A course"} for ${d.sections.get(a.section_id) ?? "a section"} (${d.teachers.get(a.teacher_id) ?? "teacher"}) has no periods on the timetable.` });
  }
  const teachable = d.periods.filter((p) => !p.is_break).length;
  const summary = {
    total_entries: d.entries.length,
    teachable_periods_per_section: teachable,
    teacher_clashes: clashes.filter((c) => c.kind === "teacher").length,
    room_clashes: clashes.filter((c) => c.kind === "room").length,
    lessons_in_breaks: clashes.filter((c) => c.kind === "break").length,
    overloaded_teacher_days: clashes.filter((c) => c.kind === "fatigue").length,
    unscheduled_assignments: clashes.filter((c) => c.kind === "unscheduled").length,
  };
  return { summary, clashes, clash_free: summary.teacher_clashes + summary.room_clashes + summary.lessons_in_breaks === 0 };
}

export type Proposal = { section_id: string; period_id: string; course_id: string; teacher_id: string; section: string; course: string; teacher: string; slot: string };

/**
 * Fills empty teachable slots with assigned courses. Never double-books a teacher,
 * spreads each course across the week, respects a per-teacher daily cap, and
 * never overwrites existing lessons.
 */
export function optimizeSchedule(d: TTData, opts: { sectionIds?: string[]; maxDailyPeriods?: number; maxPerCourseDaily?: number } = {}) {
  const maxDaily = opts.maxDailyPeriods ?? 6;
  const maxCourseDay = opts.maxPerCourseDaily ?? 1;
  const teachable = d.periods.filter((p) => !p.is_break).sort((a, b) => a.period_number - b.period_number || a.day_of_week - b.day_of_week);
  const pById = new Map(d.periods.map((p) => [p.id, p]));
  const teacherBusy = new Set<string>();
  const teacherDay = new Map<string, number>();
  const sectionFilled = new Set<string>();
  const courseDay = new Map<string, number>();
  const courseCount = new Map<string, number>();
  for (const e of d.entries) {
    const p = pById.get(e.period_id);
    if (!p) continue;
    sectionFilled.add(`${e.section_id}|${e.period_id}`);
    if (e.teacher_id) {
      teacherBusy.add(`${e.teacher_id}|${p.day_of_week}|${p.period_number}`);
      teacherDay.set(`${e.teacher_id}|${p.day_of_week}`, (teacherDay.get(`${e.teacher_id}|${p.day_of_week}`) ?? 0) + 1);
    }
    if (e.course_id) {
      courseDay.set(`${e.section_id}|${e.course_id}|${p.day_of_week}`, (courseDay.get(`${e.section_id}|${e.course_id}|${p.day_of_week}`) ?? 0) + 1);
      courseCount.set(`${e.section_id}|${e.course_id}`, (courseCount.get(`${e.section_id}|${e.course_id}`) ?? 0) + 1);
    }
  }
  const sectionIds = opts.sectionIds?.length ? opts.sectionIds : [...new Set(d.assignments.map((a) => a.section_id))];
  const proposals: Proposal[] = [];
  const unfilled: string[] = [];
  for (const sid of sectionIds) {
    const list = d.assignments.filter((a) => a.section_id === sid);
    if (!list.length) continue;
    for (const p of teachable) {
      if (sectionFilled.has(`${sid}|${p.id}`)) continue;
      // Least-scheduled course first, so subjects are balanced across the week.
      const ranked = [...list].sort((x, y) => (courseCount.get(`${sid}|${x.course_id}`) ?? 0) - (courseCount.get(`${sid}|${y.course_id}`) ?? 0));
      const pick = ranked.find((a) =>
        !teacherBusy.has(`${a.teacher_id}|${p.day_of_week}|${p.period_number}`) &&
        (teacherDay.get(`${a.teacher_id}|${p.day_of_week}`) ?? 0) < maxDaily &&
        (courseDay.get(`${sid}|${a.course_id}|${p.day_of_week}`) ?? 0) < maxCourseDay,
      );
      if (!pick) { unfilled.push(`${d.sections.get(sid) ?? sid} · ${slotLabel(p)}`); continue; }
      sectionFilled.add(`${sid}|${p.id}`);
      teacherBusy.add(`${pick.teacher_id}|${p.day_of_week}|${p.period_number}`);
      teacherDay.set(`${pick.teacher_id}|${p.day_of_week}`, (teacherDay.get(`${pick.teacher_id}|${p.day_of_week}`) ?? 0) + 1);
      courseDay.set(`${sid}|${pick.course_id}|${p.day_of_week}`, (courseDay.get(`${sid}|${pick.course_id}|${p.day_of_week}`) ?? 0) + 1);
      courseCount.set(`${sid}|${pick.course_id}`, (courseCount.get(`${sid}|${pick.course_id}`) ?? 0) + 1);
      proposals.push({ ...pick, period_id: p.id, section: d.sections.get(sid) ?? "", course: d.courses.get(pick.course_id) ?? "", teacher: d.teachers.get(pick.teacher_id) ?? "", slot: slotLabel(p) });
    }
  }
  return { proposals, unfilled_slots: unfilled };
}

/** Writes proposals; each insert is still protected by the database clash constraints. */
export async function applyProposals(sb: AnyClient, d: TTData, tenantId: string | null, proposals: Proposal[]) {
  let inserted = 0;
  const failed: string[] = [];
  for (const p of proposals) {
    const row: Record<string, unknown> = { campus_id: d.campusId, section_id: p.section_id, period_id: p.period_id, course_id: p.course_id, teacher_id: p.teacher_id };
    if (tenantId) row.tenant_id = tenantId;
    const { error } = await sb.from("timetable_entries").insert(row as never);
    if (error) failed.push(`${p.section} ${p.slot}: ${error.message}`); else inserted++;
  }
  return { inserted, failed };
}

export function findAvailableSlots(d: TTData, opts: { teacherIds?: string[]; sectionIds?: string[]; room?: string; day?: number }) {
  const pById = new Map(d.periods.map((p) => [p.id, p]));
  const busy = new Set<string>();
  for (const e of d.entries) {
    const p = pById.get(e.period_id);
    if (!p) continue;
    const k = `${p.day_of_week}|${p.period_number}`;
    if (e.teacher_id) busy.add(`t:${e.teacher_id}|${k}`);
    busy.add(`s:${e.section_id}|${k}`);
    if (e.room?.trim()) busy.add(`r:${e.room.trim().toLowerCase()}|${k}`);
  }
  const free = d.periods.filter((p) => {
    if (p.is_break) return false;
    if (opts.day !== undefined && p.day_of_week !== opts.day) return false;
    const k = `${p.day_of_week}|${p.period_number}`;
    if (opts.teacherIds?.some((t) => busy.has(`t:${t}|${k}`))) return false;
    if (opts.sectionIds?.some((s) => busy.has(`s:${s}|${k}`))) return false;
    if (opts.room && busy.has(`r:${opts.room.trim().toLowerCase()}|${k}`)) return false;
    return true;
  });
  return free.map((p) => ({ period_id: p.id, day: DAY_NAMES[p.day_of_week], period: p.period_number, time: `${p.start_time.slice(0, 5)}–${p.end_time.slice(0, 5)}` }));
}

/** Fuzzy name lookup helper for natural-language tools. */
export function matchIds(map: Map<string, string>, query?: string | null): string[] {
  if (!query?.trim()) return [];
  const q = query.trim().toLowerCase();
  if (map.has(query)) return [query];
  return [...map].filter(([, name]) => name.toLowerCase().includes(q)).map(([id]) => id);
}
