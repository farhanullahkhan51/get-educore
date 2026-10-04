/**
 * Proxy (substitute) teacher allocator. Works with any RLS-scoped Supabase client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY_NAMES, loadTimetable, type TTData, type TTPeriod } from "./timetable-engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export type ProxyCandidate = { teacher_id: string; teacher: string; score: number; reasons: string[] };
export type ProxyNeed = {
  period_id: string; slot: string; section_id: string; section: string;
  course_id: string | null; course: string; existing_proxy: string | null;
  candidates: ProxyCandidate[]; recommended: ProxyCandidate | null;
};

export type SubRow = { id: string; date: string; period_id: string; section_id: string; proxy_teacher_id: string; absent_teacher_id: string; status: string };

/** 0=Monday … 6=Sunday for a YYYY-MM-DD date. */
export const weekdayOf = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

function weekRange(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const start = new Date(d); start.setUTCDate(d.getUTCDate() - weekdayOf(date));
  const end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

export type ProxyData = { tt: TTData; departments: Map<string, string>; subs: SubRow[]; date: string };

export async function loadProxyData(sb: AnyClient, campusId: string, date: string): Promise<ProxyData> {
  const [from, to] = weekRange(date);
  const [tt, staff, subs] = await Promise.all([
    loadTimetable(sb, campusId),
    sb.from("staff").select("id, department, status").eq("campus_id", campusId),
    sb.from("timetable_substitutions").select("id, date, period_id, section_id, proxy_teacher_id, absent_teacher_id, status").eq("campus_id", campusId).gte("date", from).lte("date", to).neq("status", "cancelled"),
  ]);
  if (staff.error) throw new Error(staff.error.message);
  if (subs.error) throw new Error(subs.error.message);
  const active = (staff.data ?? []).filter((s) => !s.status || s.status === "active");
  // Inactive staff can never be proxies.
  for (const s of staff.data ?? []) if (!active.includes(s)) tt.teachers.delete(s.id);
  return {
    tt, date,
    departments: new Map(active.map((s) => [s.id as string, ((s.department as string | null) ?? "").trim().toLowerCase()])),
    subs: (subs.data ?? []) as SubRow[],
  };
}

const slotLabel = (p: TTPeriod) => `${DAY_NAMES[p.day_of_week]} P${p.period_number} (${p.start_time.slice(0, 5)}–${p.end_time.slice(0, 5)})`;

/**
 * Plans cover for every lesson the absent teachers have on the date.
 * Candidates are free that period, not absent, not already covering, under caps.
 */
export function planProxies(pd: ProxyData, absentIds: string[], opts: { maxDailyPeriods?: number; maxWeeklyProxies?: number } = {}) {
  const maxDaily = opts.maxDailyPeriods ?? 6;
  const maxWeekly = opts.maxWeeklyProxies ?? 4;
  const { tt, subs, date } = pd;
  const day = weekdayOf(date);
  const absent = new Set(absentIds);
  const pById = new Map(tt.periods.map((p) => [p.id, p]));
  const dayPeriods = new Set(tt.periods.filter((p) => p.day_of_week === day).map((p) => p.id));

  const busy = new Set<string>(); // teacher|period_id
  const load = new Map<string, number>(); // teacher -> periods today
  const subjects = new Map<string, Set<string>>(); // teacher -> course ids
  for (const a of tt.assignments) subjects.set(a.teacher_id, (subjects.get(a.teacher_id) ?? new Set()).add(a.course_id));
  for (const e of tt.entries) {
    if (!e.teacher_id || !dayPeriods.has(e.period_id)) continue;
    busy.add(`${e.teacher_id}|${e.period_id}`);
    load.set(e.teacher_id, (load.get(e.teacher_id) ?? 0) + 1);
  }
  const weekly = new Map<string, number>();
  const covered = new Map<string, string>(); // section|period -> proxy id (today)
  for (const s of subs) {
    weekly.set(s.proxy_teacher_id, (weekly.get(s.proxy_teacher_id) ?? 0) + 1);
    if (s.date === date) {
      busy.add(`${s.proxy_teacher_id}|${s.period_id}`);
      load.set(s.proxy_teacher_id, (load.get(s.proxy_teacher_id) ?? 0) + 1);
      covered.set(`${s.section_id}|${s.period_id}`, s.proxy_teacher_id);
    }
  }

  const lessons = tt.entries
    .filter((e) => e.teacher_id && absent.has(e.teacher_id) && dayPeriods.has(e.period_id) && !pById.get(e.period_id)!.is_break)
    .sort((a, b) => pById.get(a.period_id)!.period_number - pById.get(b.period_id)!.period_number);

  const needs: ProxyNeed[] = [];
  for (const e of lessons) {
    const p = pById.get(e.period_id)!;
    const existing = covered.get(`${e.section_id}|${e.period_id}`) ?? null;
    const absentDept = pd.departments.get(e.teacher_id!) ?? "";
    const candidates: ProxyCandidate[] = [];
    if (!existing) {
      for (const [tid, name] of tt.teachers) {
        if (absent.has(tid) || busy.has(`${tid}|${e.period_id}`)) continue;
        const l = load.get(tid) ?? 0, w = weekly.get(tid) ?? 0;
        if (l >= maxDaily || w >= maxWeekly) continue;
        let score = 0; const reasons: string[] = [];
        if (e.course_id && subjects.get(tid)?.has(e.course_id)) { score += 30; reasons.push("teaches this subject"); }
        const dept = pd.departments.get(tid) ?? "";
        if (absentDept && dept === absentDept) { score += 50; reasons.push("same department"); }
        score += Math.max(0, 20 - l * 4); reasons.push(`${l} period${l === 1 ? "" : "s"} today`);
        score += Math.max(0, 10 - w * 3); if (w) reasons.push(`${w} cover${w === 1 ? "" : "s"} this week`);
        candidates.push({ teacher_id: tid, teacher: name, score, reasons });
      }
      candidates.sort((a, b) => b.score - a.score || a.teacher.localeCompare(b.teacher));
    }
    const rec = candidates[0] ?? null;
    if (rec) { // reserve so the next period's plan stays consistent
      busy.add(`${rec.teacher_id}|${e.period_id}`);
      load.set(rec.teacher_id, (load.get(rec.teacher_id) ?? 0) + 1);
      weekly.set(rec.teacher_id, (weekly.get(rec.teacher_id) ?? 0) + 1);
    }
    needs.push({
      period_id: e.period_id, slot: slotLabel(p), section_id: e.section_id, section: tt.sections.get(e.section_id) ?? "Section",
      course_id: e.course_id, course: e.course_id ? tt.courses.get(e.course_id) ?? "Lesson" : "Lesson",
      existing_proxy: existing ? tt.teachers.get(existing) ?? "assigned" : null,
      candidates: candidates.slice(0, 5), recommended: rec,
    });
    (needs[needs.length - 1] as ProxyNeed & { absent_teacher_id: string }).absent_teacher_id = e.teacher_id!;
  }
  return {
    date, weekday: DAY_NAMES[day],
    lessons_to_cover: needs.length,
    already_covered: needs.filter((n) => n.existing_proxy).length,
    uncoverable: needs.filter((n) => !n.existing_proxy && !n.recommended).length,
    needs: needs as (ProxyNeed & { absent_teacher_id: string })[],
  };
}

/** Saves chosen proxies. picks: period_id|section_id -> proxy teacher id (defaults to recommended). */
export async function applyProxies(
  sb: AnyClient, pd: ProxyData, tenantId: string | null,
  plan: ReturnType<typeof planProxies>, picks: Record<string, string> = {},
) {
  const rows = plan.needs.flatMap((n) => {
    if (n.existing_proxy) return [];
    const proxy = picks[`${n.period_id}|${n.section_id}`] ?? n.recommended?.teacher_id;
    if (!proxy) return [];
    return [{
      ...(tenantId ? { tenant_id: tenantId } : {}),
      campus_id: pd.tt.campusId, date: pd.date, period_id: n.period_id, section_id: n.section_id,
      course_id: n.course_id, absent_teacher_id: n.absent_teacher_id, proxy_teacher_id: proxy,
    }];
  });
  if (!rows.length) return { saved: 0 };
  const { error } = await sb.from("timetable_substitutions").insert(rows);
  if (error) throw new Error(error.message.includes("duplicate") ? "One of these teachers or sections was just given a proxy by someone else. Refresh and try again." : error.message);
  return { saved: rows.length };
}
