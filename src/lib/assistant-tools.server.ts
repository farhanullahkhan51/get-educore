import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Db = SupabaseClient<Database>;

export type AssistantContext = {
  supabase: Db;
  userId: string;
  tenantId: string | null;
  campusId: string | null;
};

/** Resolve the tenant + default campus for the signed-in user. */
export async function loadAssistantContext(supabase: Db, userId: string): Promise<AssistantContext> {
  const { data } = await supabase.from("profiles").select("tenant_id, campus_id").eq("id", userId).maybeSingle();
  let campusId = data?.campus_id ?? null;
  let tenantId = data?.tenant_id ?? null;

  if (!campusId) {
    const { data: firstCampus } = await supabase.from("campuses").select("id, tenant_id").order("name").limit(1);
    campusId = firstCampus?.[0]?.id ?? null;
    tenantId ??= firstCampus?.[0]?.tenant_id ?? null;
  }
  return { supabase, userId, tenantId, campusId };
}

const empty = (v: string | undefined | null) => !v || !v.trim();
const clean = (v: string | undefined | null) => (empty(v) ? null : v!.trim());

function code(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
}

export function buildAssistantTools(ctx: AssistantContext) {
  const { supabase, userId } = ctx;

  async function audit(action: string, entityType: string, entityId: string | null, details: unknown) {
    if (!ctx.tenantId) return;
    await supabase.from("audit_logs").insert({
      tenant_id: ctx.tenantId,
      actor_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      campus_id: ctx.campusId,
      details: details as never,
    } as never);
  }

  /** Resolve a campus by name/code; falls back to the user's own campus. */
  async function campusIdFor(name: string): Promise<{ id: string } | { error: string }> {
    if (empty(name)) {
      if (!ctx.campusId) return { error: "No campus is available for your account." };
      return { id: ctx.campusId };
    }
    const like = `%${name.trim()}%`;
    const { data } = await supabase
      .from("campuses")
      .select("id, name")
      .or(`name.ilike.${like},code.ilike.${like}`)
      .limit(2);
    if (!data?.length) return { error: `No campus matching "${name}" was found.` };
    if (data.length > 1) return { error: `More than one campus matches "${name}": ${data.map((c) => c.name).join(", ")}.` };
    return { id: data[0].id };
  }

  async function findOne<T extends { id: string }>(
    rows: T[] | null,
    label: string,
    term: string,
    describe: (r: T) => string,
  ): Promise<{ row: T } | { error: string }> {
    if (!rows?.length) return { error: `No ${label} matching "${term}" was found.` };
    if (rows.length > 1)
      return { error: `Several ${label} records match "${term}": ${rows.slice(0, 5).map(describe).join(", ")}. Ask the user which one.` };
    return { row: rows[0] };
  }

  async function findStudent(term: string) {
    const like = `%${term.trim()}%`;
    const { data } = await supabase
      .from("students")
      .select("id, student_code, first_name, last_name, campus_id, class_id, section_id, academic_system")
      .or(`student_code.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`)
      .limit(5);
    return findOne(data, "student", term, (s) => `${s.first_name} ${s.last_name} (${s.student_code})`);
  }

  async function findStaff(term: string) {
    const like = `%${term.trim()}%`;
    const { data } = await supabase
      .from("staff")
      .select("id, staff_code, first_name, last_name, campus_id, academic_system")
      .or(`staff_code.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`)
      .limit(5);
    return findOne(data, "staff", term, (s) => `${s.first_name} ${s.last_name} (${s.staff_code})`);
  }

  async function findClass(term: string) {
    const like = `%${term.trim()}%`;
    const { data } = await supabase
      .from("classes")
      .select("id, name, grade_level, campus_id, program_id, academic_system")
      .or(`name.ilike.${like},grade_level.ilike.${like}`)
      .limit(5);
    return findOne(data, "class", term, (c) => c.name);
  }

  async function findSection(classId: string | null, term: string) {
    let q = supabase.from("sections").select("id, name, class_id, campus_id, capacity").limit(5);
    if (classId) q = q.eq("class_id", classId);
    if (!empty(term)) q = q.ilike("name", `%${term.trim()}%`);
    const { data } = await q;
    return findOne(data, "section", term || "any", (s) => s.name);
  }

  async function findCourse(term: string) {
    const like = `%${term.trim()}%`;
    const { data } = await supabase
      .from("courses")
      .select("id, code, title, campus_id, class_id, academic_system")
      .or(`code.ilike.${like},title.ilike.${like}`)
      .limit(5);
    return findOne(data, "course", term, (c) => `${c.title} (${c.code})`);
  }

  const write = tool;


  const tools = {
    /* ------------------------------------------------------------------ read */

    institution_overview: tool({
      description:
        "Headline counts for the institution the signed-in user can access: campuses, students, staff, programs, classes and sections.",
      inputSchema: z.object({}),
      execute: async () => {
        const one = async (t: "campuses" | "students" | "staff" | "programs" | "classes" | "sections") =>
          (await supabase.from(t).select("id", { count: "exact", head: true })).count ?? 0;
        return {
          campuses: await one("campuses"),
          students: await one("students"),
          staff: await one("staff"),
          programs: await one("programs"),
          classes: await one("classes"),
          sections: await one("sections"),
        };
      },
    }),

    list_campuses: tool({
      description: "List campuses with their code and academic system.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await supabase
          .from("campuses")
          .select("id, name, code, academic_system, phone, email")
          .order("name");
        return data ?? [];
      },
    }),

    list_academic_structure: tool({
      description:
        "List programs, classes, sections and courses so you can resolve the exact names the user mentioned before creating or editing records.",
      inputSchema: z.object({
        filter: z.string().describe("Optional free-text filter on names/codes. Empty string lists everything."),
      }),
      execute: async ({ filter }) => {
        const like = `%${filter.trim()}%`;
        const [programs, classes, sections, courses] = await Promise.all([
          supabase.from("programs").select("id, name, code, academic_system, campus_id").limit(100),
          supabase.from("classes").select("id, name, grade_level, academic_system, campus_id, program_id").limit(200),
          supabase.from("sections").select("id, name, class_id, capacity, campus_id").limit(300),
          filter.trim()
            ? supabase
                .from("courses")
                .select("id, code, title, academic_system, class_id, campus_id, is_active")
                .or(`code.ilike.${like},title.ilike.${like}`)
                .limit(100)
            : supabase.from("courses").select("id, code, title, academic_system, class_id, campus_id, is_active").limit(100),
        ]);
        return {
          programs: programs.data ?? [],
          classes: classes.data ?? [],
          sections: sections.data ?? [],
          courses: courses.data ?? [],
        };
      },
    }),

    search_students: tool({
      description:
        "Search students by name, student code, guardian name or guardian occupation. Returns up to 25 matching student records.",
      inputSchema: z.object({
        query: z.string().describe("Free-text search term. Use an empty string to list recent students."),
        status: z.enum(["any", "active", "inactive"]).describe("Filter by enrollment status; 'any' for no filter."),
      }),
      execute: async ({ query, status }) => {
        let q = supabase
          .from("students")
          .select(
            "id, student_code, first_name, last_name, grade, status, academic_system, guardian_name, guardian_phone, guardian_occupation, admission_date, campus_id",
          )
          .limit(25);
        const term = query.trim();
        if (term) {
          const like = `%${term}%`;
          q = q.or(
            `first_name.ilike.${like},last_name.ilike.${like},student_code.ilike.${like},guardian_name.ilike.${like},guardian_occupation.ilike.${like}`,
          );
        }
        if (status !== "any") q = q.eq("status", status);
        const { data, error } = await q.order("created_at", { ascending: false });
        if (error) return { error: error.message };
        return data ?? [];
      },
    }),

    search_staff: tool({
      description: "Search staff by name, staff code, designation or department.",
      inputSchema: z.object({
        query: z.string().describe("Free-text search term; empty string lists recent staff."),
      }),
      execute: async ({ query }) => {
        let q = supabase
          .from("staff")
          .select(
            "id, staff_code, first_name, last_name, designation, department, status, academic_system, date_of_joining, campus_id",
          )
          .limit(25);
        const term = query.trim();
        if (term) {
          const like = `%${term}%`;
          q = q.or(
            `first_name.ilike.${like},last_name.ilike.${like},staff_code.ilike.${like},designation.ilike.${like},department.ilike.${like}`,
          );
        }
        const { data, error } = await q.order("created_at", { ascending: false });
        if (error) return { error: error.message };
        return data ?? [];
      },
    }),

    fees_summary: tool({
      description:
        "Fee collection summary from challans: totals billed, collected and outstanding, a breakdown by challan status, and a per-month breakdown. Optionally filter to a single billing month.",
      inputSchema: z.object({
        month: z
          .string()
          .describe(
            "Billing month to filter on as YYYY-MM (e.g. '2026-07' for July 2026). Use an empty string for all months.",
          ),
      }),
      execute: async ({ month }) => {
        const { data, error } = await supabase
          .from("fee_challans")
          .select("gross_amount, discount_amount, fine_amount, paid_amount, status, due_date, period_label")
          .limit(5000);
        if (error) return { error: error.message };

        const monthKey = (r: { due_date: string | null; period_label: string | null }) => {
          const fromLabel = (r.period_label ?? "").match(/(\d{4})[-/](\d{1,2})/);
          if (fromLabel) return `${fromLabel[1]}-${fromLabel[2].padStart(2, "0")}`;
          return r.due_date ? r.due_date.slice(0, 7) : "unknown";
        };
        const wanted = month.trim().replace(/\//g, "-");
        const normalizedWanted = /^\d{4}-\d{1,2}$/.test(wanted)
          ? `${wanted.slice(0, 4)}-${wanted.slice(5).padStart(2, "0")}`
          : "";

        const all = data ?? [];
        const rows = normalizedWanted ? all.filter((r) => monthKey(r) === normalizedWanted) : all;

        let billed = 0;
        let collected = 0;
        const byStatus: Record<string, number> = {};
        const byMonth: Record<string, { billed: number; collected: number; challans: number }> = {};
        for (const r of rows) {
          const net = Number(r.gross_amount ?? 0) - Number(r.discount_amount ?? 0) + Number(r.fine_amount ?? 0);
          const paid = Number(r.paid_amount ?? 0);
          billed += net;
          collected += paid;
          byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
          const key = monthKey(r);
          const bucket = (byMonth[key] ??= { billed: 0, collected: 0, challans: 0 });
          bucket.billed += net;
          bucket.collected += paid;
          bucket.challans += 1;
        }
        return {
          month: normalizedWanted || "all",
          challans: rows.length,
          billed: Math.round(billed),
          collected: Math.round(collected),
          outstanding: Math.round(billed - collected),
          collection_rate_percent: billed ? Math.round((collected / billed) * 100) : 0,
          challans_by_status: byStatus,
          by_month: Object.fromEntries(
            Object.entries(byMonth)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [
                k,
                {
                  challans: v.challans,
                  billed: Math.round(v.billed),
                  collected: Math.round(v.collected),
                  outstanding: Math.round(v.billed - v.collected),
                },
              ]),
          ),
        };
      },
    }),

    attendance_summary: tool({
      description: "Attendance summary over the last N days: present/absent/late counts and attendance rate.",
      inputSchema: z.object({ days: z.number().int().describe("How many days back to look, e.g. 30.") }),
      execute: async ({ days }) => {
        const span = Math.min(Math.max(Math.round(days) || 30, 1), 365);
        const since = new Date(Date.now() - span * 86400000).toISOString().slice(0, 10);
        const { data, error } = await supabase
          .from("attendance_records")
          .select("status, date")
          .gte("date", since)
          .limit(10000);
        if (error) return { error: error.message };
        const rows = data ?? [];
        const byStatus: Record<string, number> = {};
        for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
        const present = (byStatus["present"] ?? 0) + (byStatus["late"] ?? 0);
        return {
          days: span,
          records: rows.length,
          by_status: byStatus,
          attendance_rate_percent: rows.length ? Math.round((present / rows.length) * 100) : 0,
        };
      },
    }),

    admissions_summary: tool({
      description: "Admissions funnel: inquiry counts by status and recent inquiries.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from("inquiries")
          .select("id, student_name, grade_applying_for, status, source, created_at, converted_student_id")
          .order("created_at", { ascending: false })
          .limit(500);
        if (error) return { error: error.message };
        const rows = data ?? [];
        const byStatus: Record<string, number> = {};
        for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
        return {
          total_inquiries: rows.length,
          by_status: byStatus,
          converted: rows.filter((r) => r.converted_student_id).length,
          recent: rows.slice(0, 10),
        };
      },
    }),

    results_summary: tool({
      description: "Report card / results summary: counts by status and average overall percentage (marks).",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from("report_cards")
          .select("status, overall_percent, term, academic_year")
          .limit(2000);
        if (error) return { error: error.message };
        const rows = data ?? [];
        const byStatus: Record<string, number> = {};
        let sum = 0;
        let n = 0;
        for (const r of rows) {
          byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
          if (r.overall_percent != null) {
            sum += Number(r.overall_percent);
            n += 1;
          }
        }
        return {
          report_cards: rows.length,
          by_status: byStatus,
          average_marks_percent: n ? Math.round((sum / n) * 10) / 10 : null,
        };
      },
    }),

    class_roster: tool({
      description:
        "List the students enrolled in a specific class (grade group) and optionally a section. Use this whenever the user asks who studies in a class, e.g. 'show students of Grade 9' or 'O-Level Year 1 section A'.",
      inputSchema: z.object({
        class_name: z.string().describe("Class or grade name as the user said it, e.g. 'Grade 9', '9', 'O-Level Year 1'."),
        section_name: z.string().describe("Section name such as 'A'. Use an empty string for all sections."),
      }),
      execute: async ({ class_name, section_name }) => {
        const term = class_name.trim();
        let cq = supabase.from("classes").select("id, name, grade_level, academic_year, campus_id, academic_system");
        if (term) cq = cq.or(`name.ilike.%${term}%,grade_level.ilike.%${term}%`);
        const { data: classes, error: cErr } = await cq.limit(10);
        if (cErr) return { error: cErr.message };
        if (!classes?.length) return { error: `No class matching "${term}" was found.` };

        const classIds = classes.map((c) => c.id);
        const { data: sections } = await supabase.from("sections").select("id, name, class_id").in("class_id", classIds);

        let sectionIds = (sections ?? []).map((s) => s.id);
        const sec = section_name.trim();
        if (sec) {
          sectionIds = (sections ?? []).filter((s) => s.name.toLowerCase() === sec.toLowerCase()).map((s) => s.id);
        }

        let sq = supabase
          .from("students")
          .select("id, student_code, first_name, last_name, grade, status, section_id, class_id, guardian_name")
          .limit(300);
        sq = sec && sectionIds.length ? sq.in("section_id", sectionIds) : sq.in("class_id", classIds);
        const { data: students, error: sErr } = await sq.order("first_name");
        if (sErr) return { error: sErr.message };

        const sectionMap = new Map((sections ?? []).map((s) => [s.id, s.name]));
        return {
          matched_classes: classes.map((c) => ({ id: c.id, name: c.name, academic_year: c.academic_year })),
          section_filter: sec || "all sections",
          total_students: students?.length ?? 0,
          students: (students ?? []).map((s) => ({
            student_code: s.student_code,
            name: `${s.first_name} ${s.last_name}`,
            section: s.section_id ? (sectionMap.get(s.section_id) ?? null) : null,
            grade: s.grade,
            status: s.status,
            guardian_name: s.guardian_name,
          })),
        };
      },
    }),

    recent_changes: tool({
      description: "Show the most recent changes recorded in the audit log, including the ones you made.",
      inputSchema: z.object({ limit: z.number().int().describe("How many entries to return, e.g. 10.") }),
      execute: async ({ limit }) => {
        const { data, error } = await supabase
          .from("audit_logs")
          .select("action, entity_type, entity_id, details, created_at")
          .order("created_at", { ascending: false })
          .limit(Math.min(Math.max(Math.round(limit) || 10, 1), 50));
        if (error) return { error: error.message };
        return data ?? [];
      },
    }),

    /* --------------------------------------------------------------- students */

    create_student: write({
      description:
        "Enroll a new student. Only the first and last name are required; everything else can be an empty string and filled in later.",
      inputSchema: z.object({
        first_name: z.string(),
        last_name: z.string(),
        campus: z.string().describe("Campus name or code. Empty string uses the user's own campus."),
        academic_system: z.enum(["board", "cambridge"]).describe("Which academic track the student follows."),
        class_name: z.string().describe("Class/grade to place them in, or empty string."),
        section_name: z.string().describe("Section name, or empty string."),
        grade: z.string().describe("Grade label, or empty string to derive from the class."),
        gender: z.string().describe("male/female/other, or empty string."),
        date_of_birth: z.string().describe("YYYY-MM-DD, or empty string."),
        guardian_name: z.string(),
        guardian_phone: z.string(),
        guardian_occupation: z.string(),
        address: z.string(),
      }),
      execute: async (i) => {
        const campus = await campusIdFor(i.campus);
        if ("error" in campus) return campus;

        let classId: string | null = null;
        let sectionId: string | null = null;
        if (!empty(i.class_name)) {
          const c = await findClass(i.class_name);
          if ("error" in c) return c;
          classId = c.row.id;
          if (!empty(i.section_name)) {
            const s = await findSection(classId, i.section_name);
            if ("error" in s) return s;
            sectionId = s.row.id;
          }
        }

        const payload = {
          tenant_id: ctx.tenantId,
          campus_id: campus.id,
          student_code: code("STU"),
          first_name: i.first_name.trim(),
          last_name: i.last_name.trim(),
          academic_system: i.academic_system,
          class_id: classId,
          section_id: sectionId,
          grade: clean(i.grade),
          gender: clean(i.gender),
          date_of_birth: clean(i.date_of_birth),
          guardian_name: clean(i.guardian_name),
          guardian_phone: clean(i.guardian_phone),
          guardian_occupation: clean(i.guardian_occupation),
          address: clean(i.address),
          admission_date: new Date().toISOString().slice(0, 10),
          status: "active",
        };
        const { data, error } = await supabase.from("students").insert(payload as never).select().single();
        if (error) return { error: error.message };
        await audit("create", "student", data.id, { name: `${data.first_name} ${data.last_name}` });
        return { created: data };
      },
    }),

    update_student: write({
      description:
        "Update an existing student. Identify them by name or student code. Any field left as an empty string is left unchanged.",
      inputSchema: z.object({
        student: z.string().describe("Student name or student code."),
        first_name: z.string(),
        last_name: z.string(),
        grade: z.string(),
        status: z.string().describe("active/inactive, or empty string."),
        academic_system: z.string().describe("board/cambridge, or empty string."),
        class_name: z.string(),
        section_name: z.string(),
        guardian_name: z.string(),
        guardian_phone: z.string(),
        guardian_occupation: z.string(),
        address: z.string(),
      }),
      execute: async (i) => {
        const found = await findStudent(i.student);
        if ("error" in found) return found;
        const patch: Record<string, unknown> = {};
        const set = (k: string, v: string) => {
          if (!empty(v)) patch[k] = v.trim();
        };
        set("first_name", i.first_name);
        set("last_name", i.last_name);
        set("grade", i.grade);
        set("status", i.status);
        set("academic_system", i.academic_system);
        set("guardian_name", i.guardian_name);
        set("guardian_phone", i.guardian_phone);
        set("guardian_occupation", i.guardian_occupation);
        set("address", i.address);

        if (!empty(i.class_name)) {
          const c = await findClass(i.class_name);
          if ("error" in c) return c;
          patch["class_id"] = c.row.id;
          if (!empty(i.section_name)) {
            const s = await findSection(c.row.id, i.section_name);
            if ("error" in s) return s;
            patch["section_id"] = s.row.id;
          }
        }
        if (!Object.keys(patch).length) return { error: "Nothing to update — no fields were provided." };

        const { data, error } = await supabase
          .from("students")
          .update(patch as never)
          .eq("id", found.row.id)
          .select()
          .single();
        if (error) return { error: error.message };
        await audit("update", "student", found.row.id, patch);
        return { updated: data };
      },
    }),

    delete_student: write({
      description: "Permanently delete a student record. Refuses when the student still has fee challans.",
      inputSchema: z.object({ student: z.string().describe("Student name or student code.") }),
      execute: async ({ student }) => {
        const found = await findStudent(student);
        if ("error" in found) return found;
        const { count } = await supabase
          .from("fee_challans")
          .select("id", { count: "exact", head: true })
          .eq("student_id", found.row.id);
        if (count)
          return {
            error: `${found.row.first_name} ${found.row.last_name} still has ${count} fee challan(s). Clear or remove those first in the Fees module.`,
          };
        const { error } = await supabase.from("students").delete().eq("id", found.row.id);
        if (error) return { error: error.message };
        await audit("delete", "student", found.row.id, { student_code: found.row.student_code });
        return { deleted: { id: found.row.id, name: `${found.row.first_name} ${found.row.last_name}` } };
      },
    }),

    /* ------------------------------------------------------------------ staff */

    create_staff: write({
      description: "Add a new staff member (teacher or non-teaching).",
      inputSchema: z.object({
        first_name: z.string(),
        last_name: z.string(),
        campus: z.string().describe("Campus name or code, or empty string for the user's campus."),
        designation: z.string(),
        department: z.string(),
        academic_system: z.enum(["board", "cambridge", "both"]).describe("Teaching track this staff member covers."),
        email: z.string(),
        phone: z.string(),
        qualification: z.string(),
        date_of_joining: z.string().describe("YYYY-MM-DD, or empty string for today."),
      }),
      execute: async (i) => {
        const campus = await campusIdFor(i.campus);
        if ("error" in campus) return campus;
        const payload = {
          tenant_id: ctx.tenantId,
          campus_id: campus.id,
          staff_code: code("STF"),
          first_name: i.first_name.trim(),
          last_name: i.last_name.trim(),
          designation: clean(i.designation),
          department: clean(i.department),
          academic_system: i.academic_system,
          email: clean(i.email),
          phone: clean(i.phone),
          qualification: clean(i.qualification),
          date_of_joining: clean(i.date_of_joining) ?? new Date().toISOString().slice(0, 10),
          status: "active",
        };
        const { data, error } = await supabase.from("staff").insert(payload as never).select().single();
        if (error) return { error: error.message };
        await audit("create", "staff", data.id, { name: `${data.first_name} ${data.last_name}` });
        return { created: data };
      },
    }),

    update_staff: write({
      description: "Update a staff member. Empty-string fields are left unchanged.",
      inputSchema: z.object({
        staff: z.string().describe("Staff name or staff code."),
        first_name: z.string(),
        last_name: z.string(),
        designation: z.string(),
        department: z.string(),
        academic_system: z.string().describe("board/cambridge/both, or empty string."),
        email: z.string(),
        phone: z.string(),
        status: z.string().describe("active/inactive, or empty string."),
      }),
      execute: async (i) => {
        const found = await findStaff(i.staff);
        if ("error" in found) return found;
        const patch: Record<string, unknown> = {};
        const set = (k: string, v: string) => {
          if (!empty(v)) patch[k] = v.trim();
        };
        set("first_name", i.first_name);
        set("last_name", i.last_name);
        set("designation", i.designation);
        set("department", i.department);
        set("academic_system", i.academic_system);
        set("email", i.email);
        set("phone", i.phone);
        set("status", i.status);
        if (!Object.keys(patch).length) return { error: "Nothing to update — no fields were provided." };
        const { data, error } = await supabase
          .from("staff")
          .update(patch as never)
          .eq("id", found.row.id)
          .select()
          .single();
        if (error) return { error: error.message };
        await audit("update", "staff", found.row.id, patch);
        return { updated: data };
      },
    }),

    delete_staff: write({
      description: "Permanently delete a staff member. Refuses when they are still assigned to courses or sections.",
      inputSchema: z.object({ staff: z.string().describe("Staff name or staff code.") }),
      execute: async ({ staff }) => {
        const found = await findStaff(staff);
        if ("error" in found) return found;
        const { count } = await supabase
          .from("course_assignments")
          .select("id", { count: "exact", head: true })
          .eq("teacher_id", found.row.id);
        if (count) return { error: `This staff member still has ${count} course assignment(s). Remove those first.` };
        const { error } = await supabase.from("staff").delete().eq("id", found.row.id);
        if (error) return { error: error.message };
        await audit("delete", "staff", found.row.id, { staff_code: found.row.staff_code });
        return { deleted: { id: found.row.id, name: `${found.row.first_name} ${found.row.last_name}` } };
      },
    }),

    add_payroll_entry: write({
      description: "Record a salary, bonus, increment or deduction entry for a staff member.",
      inputSchema: z.object({
        staff: z.string().describe("Staff name or staff code."),
        entry_type: z.enum(["salary", "bonus", "increment", "deduction"]),
        amount: z.number(),
        effective_date: z.string().describe("YYYY-MM-DD, or empty string for today."),
        note: z.string(),
      }),
      execute: async (i) => {
        const found = await findStaff(i.staff);
        if ("error" in found) return found;
        const { data, error } = await supabase
          .from("staff_payroll")
          .insert({
            tenant_id: ctx.tenantId,
            staff_id: found.row.id,
            campus_id: found.row.campus_id,
            entry_type: i.entry_type,
            amount: i.amount,
            effective_date: clean(i.effective_date) ?? new Date().toISOString().slice(0, 10),
            note: clean(i.note),
            created_by: userId,
          } as never)
          .select()
          .single();
        if (error) return { error: error.message };
        await audit("create", "staff_payroll", data.id, { staff: found.row.staff_code, amount: i.amount });
        return { created: data };
      },
    }),

    /* -------------------------------------------------------------- academics */

    create_program: write({
      description: "Create an academic program (e.g. 'Matric Science', 'A-Level').",
      inputSchema: z.object({
        name: z.string(),
        program_code: z.string().describe("Short code, or empty string to auto-generate."),
        academic_system: z.enum(["board", "cambridge", "both"]),
        campus: z.string(),
        duration_years: z.number().int().describe("Duration in years, 0 if unknown."),
        description: z.string(),
      }),
      execute: async (i) => {
        const campus = await campusIdFor(i.campus);
        if ("error" in campus) return campus;
        const { data, error } = await supabase
          .from("programs")
          .insert({
            tenant_id: ctx.tenantId,
            campus_id: campus.id,
            name: i.name.trim(),
            code: clean(i.program_code) ?? code("PRG"),
            academic_system: i.academic_system,
            duration_years: i.duration_years > 0 ? Math.round(i.duration_years) : null,
            description: clean(i.description),
          } as never)
          .select()
          .single();
        if (error) return { error: error.message };
        await audit("create", "program", data.id, { name: data.name });
        return { created: data };
      },
    }),

    create_class: write({
      description: "Create a class / grade group.",
      inputSchema: z.object({
        name: z.string().describe("e.g. 'Grade 9' or 'O-Level Year 1'."),
        grade_level: z.string(),
        academic_system: z.enum(["board", "cambridge", "both"]),
        campus: z.string(),
        program_name: z.string().describe("Program to attach it to, or empty string."),
        academic_year: z.string().describe("e.g. '2026-2027', or empty string."),
      }),
      execute: async (i) => {
        const campus = await campusIdFor(i.campus);
        if ("error" in campus) return campus;
        let programId: string | null = null;
        if (!empty(i.program_name)) {
          const { data } = await supabase
            .from("programs")
            .select("id, name")
            .ilike("name", `%${i.program_name.trim()}%`)
            .limit(5);
          const p = await findOne(data, "program", i.program_name, (r) => r.name);
          if ("error" in p) return p;
          programId = p.row.id;
        }
        const { data, error } = await supabase
          .from("classes")
          .insert({
            tenant_id: ctx.tenantId,
            campus_id: campus.id,
            program_id: programId,
            name: i.name.trim(),
            grade_level: clean(i.grade_level),
            academic_system: i.academic_system,
            academic_year: clean(i.academic_year),
          } as never)
          .select()
          .single();
        if (error) return { error: error.message };
        await audit("create", "class", data.id, { name: data.name });
        return { created: data };
      },
    }),

    create_section: write({
      description: "Create a section inside a class, with an optional seating capacity and room.",
      inputSchema: z.object({
        class_name: z.string(),
        name: z.string().describe("Section name, e.g. 'A' or 'Red'."),
        capacity: z.number().int().describe("Seat capacity, 0 for the default of 30."),
        room: z.string(),
        academic_system: z.enum(["board", "cambridge", "both"]),
      }),
      execute: async (i) => {
        const c = await findClass(i.class_name);
        if ("error" in c) return c;
        const { data, error } = await supabase
          .from("sections")
          .insert({
            tenant_id: ctx.tenantId,
            campus_id: c.row.campus_id,
            class_id: c.row.id,
            name: i.name.trim(),
            capacity: i.capacity > 0 ? Math.round(i.capacity) : 30,
            room: clean(i.room),
            academic_system: i.academic_system,
          } as never)
          .select()
          .single();
        if (error) return { error: error.message };
        await audit("create", "section", data.id, { name: data.name, class: c.row.name });
        return { created: data };
      },
    }),

    create_course: write({
      description: "Create a course/subject for the Board or Cambridge track.",
      inputSchema: z.object({
        title: z.string(),
        course_code: z.string().describe("Course code, or empty string to auto-generate."),
        academic_system: z.enum(["board", "cambridge", "both"]),
        campus: z.string(),
        class_name: z.string().describe("Class to attach it to, or empty string."),
        program_name: z.string().describe("Program to attach it to, or empty string."),
        credit_hours: z.number().describe("Credit hours, 0 if not applicable."),
        description: z.string(),
      }),
      execute: async (i) => {
        const campus = await campusIdFor(i.campus);
        if ("error" in campus) return campus;
        let classId: string | null = null;
        if (!empty(i.class_name)) {
          const c = await findClass(i.class_name);
          if ("error" in c) return c;
          classId = c.row.id;
        }
        let programId: string | null = null;
        if (!empty(i.program_name)) {
          const { data } = await supabase
            .from("programs")
            .select("id, name")
            .ilike("name", `%${i.program_name.trim()}%`)
            .limit(5);
          const p = await findOne(data, "program", i.program_name, (r) => r.name);
          if ("error" in p) return p;
          programId = p.row.id;
        }
        const { data, error } = await supabase
          .from("courses")
          .insert({
            tenant_id: ctx.tenantId,
            campus_id: campus.id,
            class_id: classId,
            program_id: programId,
            title: i.title.trim(),
            code: clean(i.course_code) ?? code("CRS"),
            academic_system: i.academic_system,
            credit_hours: i.credit_hours > 0 ? i.credit_hours : null,
            description: clean(i.description),
            is_active: true,
          } as never)
          .select()
          .single();
        if (error) return { error: error.message };
        await audit("create", "course", data.id, { title: data.title, code: data.code });
        return { created: data };
      },
    }),

    update_course: write({
      description: "Update a course. Empty-string fields are left unchanged.",
      inputSchema: z.object({
        course: z.string().describe("Course title or code."),
        title: z.string(),
        course_code: z.string(),
        academic_system: z.string().describe("board/cambridge/both, or empty string."),
        description: z.string(),
        is_active: z.enum(["unchanged", "active", "inactive"]),
      }),
      execute: async (i) => {
        const found = await findCourse(i.course);
        if ("error" in found) return found;
        const patch: Record<string, unknown> = {};
        if (!empty(i.title)) patch["title"] = i.title.trim();
        if (!empty(i.course_code)) patch["code"] = i.course_code.trim();
        if (!empty(i.academic_system)) patch["academic_system"] = i.academic_system.trim();
        if (!empty(i.description)) patch["description"] = i.description.trim();
        if (i.is_active !== "unchanged") patch["is_active"] = i.is_active === "active";
        if (!Object.keys(patch).length) return { error: "Nothing to update — no fields were provided." };
        const { data, error } = await supabase
          .from("courses")
          .update(patch as never)
          .eq("id", found.row.id)
          .select()
          .single();
        if (error) return { error: error.message };
        await audit("update", "course", found.row.id, patch);
        return { updated: data };
      },
    }),

    delete_course: write({
      description: "Delete a course. Refuses when assessments or teacher assignments exist for it.",
      inputSchema: z.object({ course: z.string().describe("Course title or code.") }),
      execute: async ({ course }) => {
        const found = await findCourse(course);
        if ("error" in found) return found;
        const [{ count: assessments }, { count: assignments }] = await Promise.all([
          supabase.from("assessments").select("id", { count: "exact", head: true }).eq("course_id", found.row.id),
          supabase.from("course_assignments").select("id", { count: "exact", head: true }).eq("course_id", found.row.id),
        ]);
        if (assessments || assignments)
          return {
            error: `"${found.row.title}" still has ${assessments ?? 0} assessment(s) and ${assignments ?? 0} teacher assignment(s). Remove those first.`,
          };
        const { error } = await supabase.from("courses").delete().eq("id", found.row.id);
        if (error) return { error: error.message };
        await audit("delete", "course", found.row.id, { code: found.row.code });
        return { deleted: { id: found.row.id, title: found.row.title } };
      },
    }),

    assign_course_teacher: write({
      description: "Assign a teacher to teach a course in a specific section.",
      inputSchema: z.object({
        course: z.string().describe("Course title or code."),
        class_name: z.string(),
        section_name: z.string(),
        teacher: z.string().describe("Teacher name or staff code."),
        academic_year: z.string(),
      }),
      execute: async (i) => {
        const c = await findCourse(i.course);
        if ("error" in c) return c;
        const cls = await findClass(i.class_name);
        if ("error" in cls) return cls;
        const sec = await findSection(cls.row.id, i.section_name);
        if ("error" in sec) return sec;
        const teacher = await findStaff(i.teacher);
        if ("error" in teacher) return teacher;

        const track = c.row.academic_system;
        const teacherTrack = teacher.row.academic_system;
        if (track && track !== "both" && teacherTrack !== "both" && teacherTrack !== track)
          return {
            error: `${teacher.row.first_name} ${teacher.row.last_name} teaches ${teacherTrack}, but this course is ${track}.`,
          };

        const { data, error } = await supabase
          .from("course_assignments")
          .insert({
            tenant_id: ctx.tenantId,
            campus_id: sec.row.campus_id,
            course_id: c.row.id,
            section_id: sec.row.id,
            teacher_id: teacher.row.id,
            academic_year: clean(i.academic_year),
          } as never)
          .select()
          .single();
        if (error) return { error: error.message };
        await audit("create", "course_assignment", data.id, {
          course: c.row.code,
          section: sec.row.name,
          teacher: teacher.row.staff_code,
        });
        return { created: data };
      },
    }),

    /* ------------------------------------------------------------- admissions */

    create_inquiry: write({
      description: "Log a new admission inquiry.",
      inputSchema: z.object({
        student_name: z.string(),
        guardian_name: z.string(),
        guardian_phone: z.string(),
        guardian_email: z.string(),
        grade_applying_for: z.string(),
        academic_system: z.enum(["board", "cambridge", "both"]),
        campus: z.string(),
        source: z.string(),
        notes: z.string(),
      }),
      execute: async (i) => {
        const campus = await campusIdFor(i.campus);
        if ("error" in campus) return campus;
        const { data, error } = await supabase
          .from("inquiries")
          .insert({
            tenant_id: ctx.tenantId,
            campus_id: campus.id,
            student_name: i.student_name.trim(),
            guardian_name: i.guardian_name.trim(),
            guardian_phone: i.guardian_phone.trim(),
            guardian_email: clean(i.guardian_email),
            grade_applying_for: clean(i.grade_applying_for),
            academic_system: i.academic_system,
            source: clean(i.source),
            notes: clean(i.notes),
            status: "new",
          } as never)
          .select()
          .single();
        if (error) return { error: error.message };
        await audit("create", "inquiry", data.id, { student_name: data.student_name });
        return { created: data };
      },
    }),

    update_inquiry_status: write({
      description: "Move an admission inquiry to a different pipeline stage.",
      inputSchema: z.object({
        student_name: z.string().describe("Name on the inquiry."),
        status: z.enum(["new", "contacted", "visited", "converted", "lost"]),
        notes: z.string(),
      }),
      execute: async (i) => {
        const { data: rows } = await supabase
          .from("inquiries")
          .select("id, student_name, status")
          .ilike("student_name", `%${i.student_name.trim()}%`)
          .limit(5);
        const found = await findOne(rows, "inquiry", i.student_name, (r) => r.student_name);
        if ("error" in found) return found;
        const patch: Record<string, unknown> = { status: i.status };
        if (!empty(i.notes)) patch["notes"] = i.notes.trim();
        const { data, error } = await supabase
          .from("inquiries")
          .update(patch as never)
          .eq("id", found.row.id)
          .select()
          .single();
        if (error) return { error: error.message };
        await audit("update", "inquiry", found.row.id, patch);
        return { updated: data };
      },
    }),

    /* -------------------------------------------------------------------- fees */

    create_fee_structure: write({
      description: "Create a fee structure (a recurring or one-time fee definition).",
      inputSchema: z.object({
        name: z.string(),
        category: z.enum(["tuition", "admission", "exam", "transport", "hostel", "other"]),
        amount: z.number(),
        frequency: z.enum(["monthly", "term", "annual", "one_time"]),
        campus: z.string(),
        class_name: z.string().describe("Class it applies to, or empty string for all."),
        academic_year: z.string(),
      }),
      execute: async (i) => {
        const campus = await campusIdFor(i.campus);
        if ("error" in campus) return campus;
        let classId: string | null = null;
        if (!empty(i.class_name)) {
          const c = await findClass(i.class_name);
          if ("error" in c) return c;
          classId = c.row.id;
        }
        const { data, error } = await supabase
          .from("fee_structures")
          .insert({
            tenant_id: ctx.tenantId,
            campus_id: campus.id,
            class_id: classId,
            name: i.name.trim(),
            category: i.category,
            amount: i.amount,
            frequency: i.frequency,
            academic_year: clean(i.academic_year),
            active: true,
            created_by: userId,
          } as never)
          .select()
          .single();
        if (error) return { error: error.message };
        await audit("create", "fee_structure", data.id, { name: data.name, amount: i.amount });
        return { created: data };
      },
    }),

    issue_challan: write({
      description: "Issue a fee challan for one student.",
      inputSchema: z.object({
        student: z.string().describe("Student name or student code."),
        category: z.enum(["tuition", "admission", "exam", "transport", "hostel", "other"]),
        amount: z.number().describe("Gross amount to bill."),
        discount: z.number().describe("Discount amount, 0 for none."),
        period_label: z.string().describe("Billing period, e.g. 'July 2026'."),
        due_date: z.string().describe("YYYY-MM-DD; empty string means 14 days from today."),
        notes: z.string(),
      }),
      execute: async (i) => {
        const found = await findStudent(i.student);
        if ("error" in found) return found;
        const due = clean(i.due_date) ?? new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
        const { data, error } = await supabase
          .from("fee_challans")
          .insert({
            tenant_id: ctx.tenantId,
            campus_id: found.row.campus_id,
            student_id: found.row.id,
            challan_no: code("CH"),
            category: i.category,
            period_label: clean(i.period_label),
            issue_date: new Date().toISOString().slice(0, 10),
            due_date: due,
            gross_amount: i.amount,
            discount_amount: i.discount > 0 ? i.discount : 0,
            fine_amount: 0,
            paid_amount: 0,
            status: "unpaid",
            notes: clean(i.notes),
            created_by: userId,
          } as never)
          .select()
          .single();
        if (error) return { error: error.message };
        await audit("create", "fee_challan", data.id, { challan_no: data.challan_no, amount: i.amount });
        return { created: data };
      },
    }),

    record_payment: write({
      description: "Record a payment against a fee challan and update its status.",
      inputSchema: z.object({
        challan_no: z.string().describe("Challan number."),
        amount: z.number(),
        notes: z.string(),
      }),
      execute: async (i) => {
        const { data: challan, error: cErr } = await supabase
          .from("fee_challans")
          .select("id, campus_id, challan_no, gross_amount, discount_amount, fine_amount, paid_amount")
          .eq("challan_no", i.challan_no.trim())
          .maybeSingle();
        if (cErr) return { error: cErr.message };
        if (!challan) return { error: `No challan numbered "${i.challan_no}" was found.` };

        const net =
          Number(challan.gross_amount ?? 0) - Number(challan.discount_amount ?? 0) + Number(challan.fine_amount ?? 0);
        const paid = Number(challan.paid_amount ?? 0) + i.amount;
        const status = paid >= net ? "paid" : paid > 0 ? "partial" : "unpaid";

        const { error: uErr } = await supabase
          .from("fee_challans")
          .update({
            paid_amount: paid,
            status,
            paid_on: status === "paid" ? new Date().toISOString().slice(0, 10) : null,
          } as never)
          .eq("id", challan.id);
        if (uErr) return { error: uErr.message };

        await supabase.from("fee_ledger").insert({
          tenant_id: ctx.tenantId,
          campus_id: challan.campus_id,
          challan_id: challan.id,
          entry_type: "payment",
          amount: i.amount,
          notes: clean(i.notes),
          created_by: userId,
        } as never);
        await audit("update", "fee_challan", challan.id, { payment: i.amount, status });
        return { challan_no: challan.challan_no, paid_total: paid, outstanding: Math.max(0, net - paid), status };
      },
    }),

    create_scholarship: write({
      description: "Grant a scholarship or discount to a student.",
      inputSchema: z.object({
        student: z.string(),
        name: z.string(),
        scholarship_type: z.enum(["percentage", "fixed"]),
        value: z.number(),
        reason: z.string(),
      }),
      execute: async (i) => {
        const found = await findStudent(i.student);
        if ("error" in found) return found;
        const { data, error } = await supabase
          .from("scholarships")
          .insert({
            tenant_id: ctx.tenantId,
            campus_id: found.row.campus_id,
            student_id: found.row.id,
            name: i.name.trim(),
            scholarship_type: i.scholarship_type,
            value: i.value,
            reason: clean(i.reason),
            status: "active",
            approved_by: userId,
          } as never)
          .select()
          .single();
        if (error) return { error: error.message };
        await audit("create", "scholarship", data.id, { student: found.row.student_code, value: i.value });
        return { created: data };
      },
    }),

    /* ---------------------------------------------------- attendance & results */

    mark_attendance: write({
      description:
        "Mark attendance for one student on a given date. Use the section the student belongs to unless another is named.",
      inputSchema: z.object({
        student: z.string(),
        status: z.enum(["present", "absent", "late", "leave"]),
        date: z.string().describe("YYYY-MM-DD, or empty string for today."),
        remarks: z.string(),
      }),
      execute: async (i) => {
        const found = await findStudent(i.student);
        if ("error" in found) return found;
        if (!found.row.section_id) return { error: "This student is not assigned to a section yet." };
        const { data, error } = await supabase
          .from("attendance_records")
          .insert({
            tenant_id: ctx.tenantId,
            campus_id: found.row.campus_id,
            section_id: found.row.section_id,
            student_id: found.row.id,
            date: clean(i.date) ?? new Date().toISOString().slice(0, 10),
            status: i.status,
            remarks: clean(i.remarks),
            marked_by: userId,
          } as never)
          .select()
          .single();
        if (error) return { error: error.message };
        await audit("create", "attendance", data.id, { student: found.row.student_code, status: i.status });
        return { created: data };
      },
    }),

    create_assessment: write({
      description: "Create an assessment (quiz, assignment, midterm, final, project) for a course and section.",
      inputSchema: z.object({
        title: z.string(),
        course: z.string(),
        class_name: z.string(),
        section_name: z.string(),
        type: z.enum(["quiz", "assignment", "midterm", "final", "project", "other"]),
        max_marks: z.number(),
        weight_percent: z.number().describe("Weight toward the term, 0 if not applicable."),
        due_date: z.string().describe("YYYY-MM-DD, or empty string."),
        term: z.string(),
      }),
      execute: async (i) => {
        const c = await findCourse(i.course);
        if ("error" in c) return c;
        const cls = await findClass(i.class_name);
        if ("error" in cls) return cls;
        const sec = await findSection(cls.row.id, i.section_name);
        if ("error" in sec) return sec;
        const { data, error } = await supabase
          .from("assessments")
          .insert({
            tenant_id: ctx.tenantId,
            campus_id: sec.row.campus_id,
            course_id: c.row.id,
            section_id: sec.row.id,
            title: i.title.trim(),
            type: i.type,
            max_marks: i.max_marks,
            weight_percent: i.weight_percent > 0 ? i.weight_percent : 0,
            due_date: clean(i.due_date),
            term: clean(i.term),
            created_by: userId,
          } as never)
          .select()
          .single();
        if (error) return { error: error.message };
        await audit("create", "assessment", data.id, { title: data.title });
        return { created: data };
      },
    }),

    record_marks: write({
      description: "Record a student's marks for an existing assessment.",
      inputSchema: z.object({
        assessment_title: z.string(),
        student: z.string(),
        marks: z.number(),
        is_absent: z.enum(["no", "yes"]),
        remarks: z.string(),
      }),
      execute: async (i) => {
        const { data: rows } = await supabase
          .from("assessments")
          .select("id, title, campus_id, max_marks")
          .ilike("title", `%${i.assessment_title.trim()}%`)
          .limit(5);
        const a = await findOne(rows, "assessment", i.assessment_title, (r) => r.title);
        if ("error" in a) return a;
        const found = await findStudent(i.student);
        if ("error" in found) return found;
        if (i.marks > Number(a.row.max_marks))
          return { error: `Marks cannot exceed the assessment maximum of ${a.row.max_marks}.` };

        const { data, error } = await supabase
          .from("assessment_scores")
          .insert({
            tenant_id: ctx.tenantId,
            assessment_id: a.row.id,
            student_id: found.row.id,
            campus_id: a.row.campus_id,
            marks: i.marks,
            is_absent: i.is_absent === "yes",
            remarks: clean(i.remarks),
            entered_by: userId,
          } as never)
          .select()
          .single();
        if (error) return { error: error.message };
        await audit("create", "assessment_score", data.id, { student: found.row.student_code, marks: i.marks });
        return { created: data };
      },
    }),

    publish_report_card: write({
      description: "Publish a student's report card for a term so it becomes visible in the student portal.",
      inputSchema: z.object({
        student: z.string(),
        term: z.string(),
        academic_year: z.string().describe("Empty string matches any year."),
      }),
      execute: async (i) => {
        const found = await findStudent(i.student);
        if ("error" in found) return found;
        let q = supabase
          .from("report_cards")
          .select("id, term, academic_year, status")
          .eq("student_id", found.row.id)
          .ilike("term", `%${i.term.trim()}%`);
        if (!empty(i.academic_year)) q = q.eq("academic_year", i.academic_year.trim());
        const { data: rows } = await q.limit(5);
        const rc = await findOne(rows, "report card", i.term, (r) => `${r.term} ${r.academic_year}`);
        if ("error" in rc) return rc;
        const { data, error } = await supabase
          .from("report_cards")
          .update({ status: "published", published_at: new Date().toISOString() } as never)
          .eq("id", rc.row.id)
          .select()
          .single();
        if (error) return { error: error.message };
        await audit("update", "report_card", rc.row.id, { status: "published" });
        return { published: data };
      },
    }),

    /* ------------------------------------------------------------ certificates */

    issue_certificate: write({
      description: "Issue a certificate for a student or staff member.",
      inputSchema: z.object({
        recipient: z.string().describe("Student or staff name / code."),
        recipient_kind: z.enum(["student", "staff"]),
        type: z.enum([
          "character",
          "bonafide",
          "school_leaving",
          "transfer",
          "provisional",
          "passing",
          "participation",
          "merit",
          "experience",
          "custom",
        ]),
        title: z.string(),
        body: z.string().describe("Certificate body text."),
        remarks: z.string(),
      }),
      execute: async (i) => {
        const person =
          i.recipient_kind === "student" ? await findStudent(i.recipient) : await findStaff(i.recipient);
        if ("error" in person) return person;
        const row = person.row as { id: string; first_name: string; last_name: string; campus_id: string };
        const { data, error } = await supabase
          .from("certificates")
          .insert({
            tenant_id: ctx.tenantId,
            campus_id: row.campus_id,
            student_id: i.recipient_kind === "student" ? row.id : null,
            staff_id: i.recipient_kind === "staff" ? row.id : null,
            recipient_name: `${row.first_name} ${row.last_name}`,
            type: i.type,
            title: i.title.trim(),
            serial_no: code("CERT"),
            issue_date: new Date().toISOString().slice(0, 10),
            body: i.body.trim(),
            remarks: clean(i.remarks),
            issued_by: userId,
            status: "issued",
          } as never)
          .select()
          .single();
        if (error) return { error: error.message };
        await audit("create", "certificate", data.id, { serial_no: data.serial_no, recipient: data.recipient_name });
        return { created: data };
      },
    }),

    revoke_certificate: write({
      description: "Revoke a previously issued certificate by its serial number.",
      inputSchema: z.object({ serial_no: z.string(), reason: z.string() }),
      execute: async (i) => {
        const { data: cert } = await supabase
          .from("certificates")
          .select("id, serial_no")
          .eq("serial_no", i.serial_no.trim())
          .maybeSingle();
        if (!cert) return { error: `No certificate with serial "${i.serial_no}" was found.` };
        const { data, error } = await supabase
          .from("certificates")
          .update({
            status: "revoked",
            revoked_at: new Date().toISOString(),
            revoke_reason: clean(i.reason),
          } as never)
          .eq("id", cert.id)
          .select()
          .single();
        if (error) return { error: error.message };
        await audit("update", "certificate", cert.id, { status: "revoked" });
        return { revoked: data };
      },
    }),

    // ---------------------------------------------------------------- interface
    list_module_layout_options: read({
      description:
        "List the interface layout options a module supports (grouping, filtering, sorting, hideable columns, density). Call this before proposing any interface change so you only use supported values.",
      inputSchema: z.object({ module: z.enum(MODULE_ENUM) }),
      execute: async (i) => {
        const spec = MODULE_LAYOUTS[i.module];
        return {
          module: i.module,
          label: spec.label,
          group_by: spec.groupBy,
          filter: spec.filter,
          sort_by: spec.sortBy,
          hideable_columns: spec.columns,
          density: ["comfortable", "compact"],
        };
      },
    }),

    get_module_layout: read({
      description: "Read the interface layout currently applied to a module for the signed-in user.",
      inputSchema: z.object({ module: z.enum(MODULE_ENUM) }),
      execute: async (i) => {
        const layout = await currentLayout(i.module);
        return { module: i.module, layout, summary: describeLayout(i.module, layout) };
      },
    }),

    set_module_layout: write({
      description:
        "Change how a module's interface is arranged (for example, split Classes into Board and Cambridge groups). Only pass the fields that should change. Scope 'personal' changes the current user's own view; 'institution' sets the shared default and requires an admin role.",
      inputSchema: z.object({
        module: z.enum(MODULE_ENUM),
        scope: z.enum(["personal", "institution"]),
        group_by: z.string().describe("Grouping option value, or empty to leave unchanged."),
        filter: z.string().describe("Filter option value, or empty to leave unchanged."),
        sort_by: z.string().describe("Sort option value, or empty to leave unchanged."),
        density: z.string().describe("'comfortable', 'compact', or empty to leave unchanged."),
        hidden_columns: z.array(z.string()).describe("Full list of column values to hide; empty array shows all."),
      }),
      execute: async (i) => {
        const spec = MODULE_LAYOUTS[i.module];
        const base = await currentLayout(i.module);
        const next = sanitizeLayout(i.module, {
          ...base,
          ...(empty(i.group_by) ? {} : { groupBy: i.group_by.trim() }),
          ...(empty(i.filter) ? {} : { filter: i.filter.trim() }),
          ...(empty(i.sort_by) ? {} : { sortBy: i.sort_by.trim() }),
          ...(empty(i.density) ? {} : { density: i.density.trim() as "compact" | "comfortable" }),
          hidden: i.hidden_columns ?? base.hidden,
        });

        const unsupported = [
          !empty(i.group_by) && next.groupBy !== i.group_by.trim() ? `group_by "${i.group_by}"` : null,
          !empty(i.filter) && next.filter !== i.filter.trim() ? `filter "${i.filter}"` : null,
          !empty(i.sort_by) && next.sortBy !== i.sort_by.trim() ? `sort_by "${i.sort_by}"` : null,
        ].filter(Boolean);
        if (unsupported.length)
          return {
            error: `${spec.label} does not support ${unsupported.join(", ")}. Supported values: group_by ${spec.groupBy
              .map((o) => o.value)
              .join("/")}, filter ${spec.filter.map((o) => o.value).join("/")}, sort_by ${spec.sortBy
              .map((o) => o.value)
              .join("/")}.`,
          };

        const saved = await saveLayout(i.module, next, i.scope === "institution");
        if ("error" in saved) return saved;
        await audit("update", "ui_layout", null, { module: i.module, scope: i.scope, layout: next });
        return {
          module: i.module,
          scope: i.scope,
          layout: next,
          summary: `${spec.label} is now ${describeLayout(i.module, next)}.`,
        };
      },
    }),

    reset_module_layout: write({
      description: "Reset a module's interface layout back to the default.",
      inputSchema: z.object({ module: z.enum(MODULE_ENUM), scope: z.enum(["personal", "institution"]) }),
      execute: async (i) => {
        const target = i.scope === "institution" ? null : userId;
        let q = supabase.from("ui_preferences").delete().eq("module", i.module);
        q = target === null ? q.is("user_id", null) : q.eq("user_id", target);
        const { error } = await q;
        if (error) return { error: error.message };
        await audit("delete", "ui_layout", null, { module: i.module, scope: i.scope });
        return { module: i.module, scope: i.scope, reset: true };
      },
    }),
  };

  // every mutating tool must be approved by the user in the chat before it runs
  const WRITE_TOOLS = ["create_student", "update_student", "delete_student", "create_staff", "update_staff", "delete_staff", "add_payroll_entry", "create_program", "create_class", "create_section", "create_course", "update_course", "delete_course", "assign_course_teacher", "create_inquiry", "update_inquiry_status", "create_fee_structure", "issue_challan", "record_payment", "create_scholarship", "mark_attendance", "create_assessment", "record_marks", "publish_report_card", "issue_certificate", "revoke_certificate", "set_module_layout", "reset_module_layout"] as const;

  for (const name of WRITE_TOOLS) {
    (tools as Record<string, { needsApproval?: boolean }>)[name].needsApproval = true;
  }

  return tools;
}
