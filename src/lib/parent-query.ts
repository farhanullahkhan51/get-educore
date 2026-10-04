import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Parent Query Handler: a parent identifies a child by student code + the
 * guardian phone on file. Both must match one student, otherwise nothing
 * about any student is returned. Runs on the caller's client (RLS applies).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any>;

export const QUERY_TOPICS = ["fees", "attendance", "results", "timetable", "notices"] as const;
export type QueryTopic = (typeof QUERY_TOPICS)[number];

/** Normalise Pakistani-style numbers: +92 300 1234567, 0300-1234567, 923001234567 → 3001234567. */
export function normalizePhone(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.length > 10 ? d.slice(-10) : d.replace(/^0+/, "");
}

export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizePhone(a), y = normalizePhone(b);
  return x.length >= 9 && x === y;
}

const REFUSAL = "Verification failed: the student code and guardian phone number do not match our records. No information can be shared.";

export async function verifyParent(sb: Sb, identifier: string, phone: string) {
  const code = identifier.trim();
  if (!code || normalizePhone(phone).length < 9) return { ok: false as const, message: REFUSAL };
  const { data, error } = await sb.from("students")
    .select("id, first_name, last_name, student_code, guardian_name, guardian_phone, status, section_id, class_id, campus_id, academic_system")
    .ilike("student_code", code.replace(/[%_]/g, ""))
    .limit(5);
  if (error) throw new Error(error.message);
  const matches = (data ?? []).filter((s) => phonesMatch(s.guardian_phone, phone));
  if (matches.length !== 1) return { ok: false as const, message: REFUSAL };
  return { ok: true as const, student: matches[0] };
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export async function parentSnapshot(sb: Sb, identifier: string, phone: string, topics: readonly QueryTopic[] = QUERY_TOPICS) {
  const v = await verifyParent(sb, identifier, phone);
  if (!v.ok) return { verified: false, message: v.message };
  const s = v.student;
  const want = new Set(topics.length ? topics : QUERY_TOPICS);
  const today = todayISO();

  const [sec, cls] = await Promise.all([
    s.section_id ? sb.from("sections").select("name").eq("id", s.section_id).maybeSingle() : Promise.resolve({ data: null }),
    s.class_id ? sb.from("classes").select("name").eq("id", s.class_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const out: Record<string, unknown> = {
    verified: true,
    student: {
      name: `${s.first_name} ${s.last_name}`.trim(),
      student_code: s.student_code,
      class: (cls.data as { name?: string } | null)?.name ?? null,
      section: (sec.data as { name?: string } | null)?.name ?? null,
      track: s.academic_system,
      status: s.status,
      guardian: s.guardian_name,
    },
  };

  if (want.has("fees")) {
    const { data } = await sb.from("fee_challans")
      .select("challan_no, period_label, category, due_date, gross_amount, discount_amount, fine_amount, paid_amount, status, paid_on")
      .eq("student_id", s.id).order("due_date", { ascending: false }).limit(24);
    const rows = (data ?? []).map((c) => {
      const net = Number(c.gross_amount) - Number(c.discount_amount) + Number(c.fine_amount);
      const balance = Math.max(net - Number(c.paid_amount), 0);
      const overdue = balance > 0 && c.status !== "cancelled" && c.due_date < today;
      return { ...c, net_amount: net, balance, overdue };
    }).filter((c) => c.status !== "cancelled");
    const pending = rows.filter((c) => c.balance > 0);
    out.fees = {
      currency: "PKR",
      outstanding_total: pending.reduce((a, c) => a + c.balance, 0),
      overdue_total: pending.filter((c) => c.overdue).reduce((a, c) => a + c.balance, 0),
      pending_challans: pending.map(({ challan_no, period_label, due_date, balance, overdue }) => ({ challan_no, period_label, due_date, balance, overdue })),
      last_payment: rows.filter((c) => c.paid_on).sort((a, b) => String(b.paid_on).localeCompare(String(a.paid_on)))[0] ?? null,
    };
  }

  if (want.has("attendance")) {
    const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const { data } = await sb.from("attendance_records").select("date, status")
      .eq("student_id", s.id).is("course_id", null).gte("date", from).order("date", { ascending: false });
    const rows = data ?? [];
    const count = (st: string) => rows.filter((r) => r.status === st).length;
    const present = count("present") + count("late");
    out.attendance = {
      period: `last 30 days (since ${from})`,
      days_marked: rows.length, present: count("present"), late: count("late"), absent: count("absent"), leave: count("leave"),
      attendance_percent: rows.length ? Math.round((present / rows.length) * 100) : null,
      recent_absences: rows.filter((r) => r.status === "absent").slice(0, 10).map((r) => r.date),
    };
  }

  if (want.has("results")) {
    const { data } = await sb.from("report_cards")
      .select("term, academic_year, overall_percent, gpa, attendance_percent, remarks, subjects, published_at")
      .eq("student_id", s.id).eq("status", "published").order("published_at", { ascending: false }).limit(3);
    out.results = data?.length ? data : "No published results yet.";
  }

  if (want.has("timetable") && s.section_id) {
    const dow = (new Date().getDay() + 6) % 7; // 0 = Monday
    const { data } = await sb.from("timetable_entries")
      .select("day_of_week, room, period:timetable_periods(label, start_time, end_time, sort_order), course:courses(title, code), teacher:staff(first_name, last_name)")
      .eq("section_id", s.section_id).eq("day_of_week", dow);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = ((data ?? []) as any[]).sort((a, b) => (a.period?.sort_order ?? 0) - (b.period?.sort_order ?? 0));
    out.timetable_today = list.length
      ? list.map((e) => ({ period: e.period?.label, time: `${e.period?.start_time?.slice(0, 5)}–${e.period?.end_time?.slice(0, 5)}`, subject: e.course?.title || e.course?.code, teacher: e.teacher ? `${e.teacher.first_name} ${e.teacher.last_name}` : null, room: e.room }))
      : "No lessons scheduled today.";
  }

  if (want.has("notices")) {
    const { data } = await sb.from("notices")
      .select("reference_no, title, category, priority, published_at, expires_at")
      .eq("is_published", true).in("audience", ["all", "students"])
      .or(`expires_at.is.null,expires_at.gte.${today}`)
      .order("published_at", { ascending: false }).limit(5);
    out.notices = data ?? [];
  }

  return out;
}
