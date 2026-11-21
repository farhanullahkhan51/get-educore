import { Constants, type Database } from "@/integrations/supabase/types";

export type SearchSource = {
  table: keyof Database["public"]["Tables"];
  to: string;
  label: string;
  text: string[];
  enums: Record<string, readonly string[]>;
  dates: Record<string, string>;
  numbers: string[];
  refs: string[];
};

/** Only application records and safe, visible scalar fields; never credentials or storage internals. */
export const SEARCH_SOURCES: SearchSource[] = [
  {"table": "students", "to": "/students", "label": "Students", "text": ["address", "first_name", "gender", "grade", "guardian_name", "guardian_occupation", "guardian_phone", "last_name", "status", "student_code"], "enums": {"academic_system": Constants.public.Enums.academic_system}, "numbers": [], "refs": ["class_id", "section_id"], "dates": {"admission_date": "date", "date_of_birth": "date"}},
  {"table": "staff", "to": "/staff", "label": "Staff", "text": ["address", "department", "designation", "email", "first_name", "last_name", "phone", "qualification", "staff_code", "status"], "enums": {"academic_system": Constants.public.Enums.academic_system}, "numbers": [], "refs": [], "dates": {"date_of_joining": "date"}},
  {"table": "inquiries", "to": "/admissions", "label": "Admissions", "text": ["address", "grade_applying_for", "guardian_email", "guardian_name", "guardian_phone", "guardian_relation", "notes", "previous_school", "source", "student_gender", "student_name"], "enums": {"academic_system": Constants.public.Enums.academic_system, "status": Constants.public.Enums.inquiry_status}, "numbers": [], "refs": [], "dates": {"student_dob": "date"}},
  {"table": "campuses", "to": "/campuses", "label": "Campuses", "text": ["address", "code", "email", "name", "phone"], "enums": {"academic_system": Constants.public.Enums.academic_system}, "numbers": [], "refs": [], "dates": {}},
  {"table": "programs", "to": "/programs", "label": "Programs", "text": ["code", "description", "name"], "enums": {"academic_system": Constants.public.Enums.academic_system}, "numbers": ["duration_years"], "refs": [], "dates": {}},
  {"table": "classes", "to": "/classes", "label": "Classes", "text": ["academic_year", "grade_level", "name"], "enums": {"academic_system": Constants.public.Enums.academic_system}, "numbers": [], "refs": [], "dates": {}},
  {"table": "sections", "to": "/classes", "label": "Sections", "text": ["name", "room"], "enums": {"academic_system": Constants.public.Enums.academic_system}, "numbers": ["capacity"], "refs": ["class_id"], "dates": {}},
  {"table": "courses", "to": "/courses", "label": "Courses", "text": ["academic_system", "code", "description", "stream", "title"], "enums": {}, "numbers": ["credit_hours"], "refs": ["class_id"], "dates": {}},
  {"table": "assessments", "to": "/academics", "label": "Assessments", "text": ["academic_year", "term", "title"], "enums": {"type": Constants.public.Enums.assessment_type}, "numbers": ["max_marks", "weight_percent"], "refs": ["course_id", "section_id"], "dates": {"due_date": "date"}},
  {"table": "attendance_records", "to": "/academics", "label": "Student attendance", "text": ["remarks"], "enums": {"status": Constants.public.Enums.attendance_status}, "numbers": [], "refs": ["course_id", "section_id", "student_id"], "dates": {"date": "date"}},
  {"table": "assessment_scores", "to": "/results", "label": "Assessment scores", "text": ["remarks"], "enums": {}, "numbers": ["marks"], "refs": ["student_id"], "dates": {}},
  {"table": "report_cards", "to": "/results", "label": "Report cards", "text": ["academic_year", "remarks", "term"], "enums": {"status": Constants.public.Enums.report_card_status}, "numbers": ["attendance_percent", "gpa", "overall_percent"], "refs": ["section_id", "student_id"], "dates": {}},
  {"table": "grading_scales", "to": "/results", "label": "Grading scales", "text": ["name"], "enums": {}, "numbers": [], "refs": [], "dates": {}},
  {"table": "fee_challans", "to": "/fees", "label": "Fee challans", "text": ["challan_no", "notes", "period_label"], "enums": {"category": Constants.public.Enums.fee_category, "status": Constants.public.Enums.challan_status}, "numbers": ["discount_amount", "fine_amount", "gross_amount", "paid_amount"], "refs": ["student_id"], "dates": {"due_date": "date", "issue_date": "date", "paid_on": "date"}},
  {"table": "fee_structures", "to": "/fees", "label": "Fee structures", "text": ["academic_year", "name", "notes"], "enums": {"category": Constants.public.Enums.fee_category, "frequency": Constants.public.Enums.fee_frequency}, "numbers": ["amount"], "refs": ["class_id"], "dates": {}},
  {"table": "fee_ledger", "to": "/fees", "label": "Fee ledger", "text": ["entry_type", "notes"], "enums": {}, "numbers": ["amount"], "refs": ["challan_id"], "dates": {}},
  {"table": "scholarships", "to": "/fees", "label": "Scholarships", "text": ["name", "reason"], "enums": {"scholarship_type": Constants.public.Enums.scholarship_type, "status": Constants.public.Enums.scholarship_status}, "numbers": ["value"], "refs": ["student_id"], "dates": {"ends_on": "date", "starts_on": "date"}},
  {"table": "bank_accounts", "to": "/fees", "label": "Bank accounts", "text": ["account_number", "account_title", "bank_name", "branch", "iban"], "enums": {}, "numbers": [], "refs": [], "dates": {}},
  {"table": "bank_transactions", "to": "/fees", "label": "Bank transactions", "text": ["description", "match_note", "match_status", "reference", "source"], "enums": {}, "numbers": ["amount", "applied_amount"], "refs": [], "dates": {"txn_date": "date"}},
  {"table": "expenses", "to": "/expenses", "label": "Expenses", "text": ["category", "description", "entry_type", "payee", "payment_mode", "reference", "status", "voucher_no"], "enums": {}, "numbers": ["amount", "tax_amount"], "refs": [], "dates": {"expense_date": "date"}},
  {"table": "homework_entries", "to": "/homework", "label": "Homework & diary", "text": ["details", "kind", "subject", "title"], "enums": {}, "numbers": [], "refs": ["course_id", "section_id"], "dates": {"assigned_on": "date", "due_on": "date"}},
  {"table": "notices", "to": "/notices", "label": "Notices", "text": ["audience", "category", "content", "issued_by", "priority", "reference_no", "title"], "enums": {}, "numbers": [], "refs": [], "dates": {}},
  {"table": "certificates", "to": "/certificates", "label": "Certificates", "text": ["body", "recipient_name", "recipient_ref", "remarks", "revoke_reason", "serial_no", "title"], "enums": {"status": Constants.public.Enums.certificate_status, "type": Constants.public.Enums.certificate_type}, "numbers": [], "refs": ["staff_id", "student_id"], "dates": {"issue_date": "date"}},
  {"table": "staff_attendance", "to": "/staff", "label": "Staff attendance", "text": ["note", "status"], "enums": {}, "numbers": [], "refs": ["staff_id"], "dates": {"check_in": "time without time zone", "check_out": "time without time zone", "date": "date"}},
  {"table": "staff_leaves", "to": "/staff", "label": "Staff leave", "text": ["leave_type", "reason", "review_note", "status"], "enums": {}, "numbers": [], "refs": ["staff_id"], "dates": {"end_date": "date", "start_date": "date"}},
  {"table": "staff_payroll", "to": "/staff", "label": "Payroll", "text": ["entry_type", "note"], "enums": {}, "numbers": ["amount"], "refs": ["staff_id"], "dates": {"effective_date": "date"}},
  {"table": "board_registrations", "to": "/board", "label": "Board registrations", "text": ["board_name", "exam_center", "notes", "part", "registration_no", "roll_no", "session_year"], "enums": {"group_name": Constants.public.Enums.board_group, "level": Constants.public.Enums.board_level, "status": Constants.public.Enums.board_registration_status}, "numbers": [], "refs": ["student_id"], "dates": {}},
  {"table": "board_exam_entries", "to": "/board", "label": "Board subjects", "text": ["paper", "subject_code", "subject_name"], "enums": {}, "numbers": ["display_order", "practical_max", "theory_max"], "refs": ["registration_id"], "dates": {}},
  {"table": "board_results", "to": "/board", "label": "Board results", "text": ["grade", "remarks"], "enums": {"status": Constants.public.Enums.board_result_status}, "numbers": ["practical_marks", "theory_marks", "total_marks"], "refs": ["entry_id"], "dates": {}},
  {"table": "cambridge_registrations", "to": "/cambridge", "label": "Cambridge registrations", "text": ["candidate_number", "centre_number", "notes", "session_year", "status"], "enums": {"level": Constants.public.Enums.cambridge_level, "session": Constants.public.Enums.cambridge_session}, "numbers": [], "refs": ["student_id"], "dates": {}},
  {"table": "cambridge_subject_entries", "to": "/cambridge", "label": "Cambridge subjects", "text": ["components", "subject_name", "syllabus_code", "tier"], "enums": {}, "numbers": ["display_order"], "refs": ["registration_id"], "dates": {}},
  {"table": "cambridge_results", "to": "/cambridge", "label": "Cambridge results", "text": ["grade", "remarks", "status"], "enums": {}, "numbers": ["percentage", "ums"], "refs": ["entry_id"], "dates": {}},
  {"table": "timetable_entries", "to": "/timetable", "label": "Lessons", "text": ["room"], "enums": {}, "numbers": [], "refs": ["course_id", "section_id", "teacher_id"], "dates": {}},
  {"table": "timetable_periods", "to": "/timetable", "label": "Timetable periods", "text": ["label"], "enums": {}, "numbers": ["day_of_week", "period_number"], "refs": [], "dates": {"end_time": "time without time zone", "start_time": "time without time zone"}},
  {"table": "timetable_substitutions", "to": "/timetable", "label": "Proxy allocations", "text": ["remarks", "status"], "enums": {}, "numbers": [], "refs": ["absent_teacher_id", "course_id", "proxy_teacher_id", "section_id"], "dates": {"date": "date"}},
  {"table": "track_switches", "to": "/track-switch", "label": "Track switches", "text": ["from_system", "reason", "to_system"], "enums": {}, "numbers": [], "refs": ["student_id"], "dates": {"effective_date": "date"}},
  {"table": "profiles", "to": "/users", "label": "Users", "text": ["email", "full_name", "phone"], "enums": {}, "numbers": [], "refs": [], "dates": {}},
  {"table": "invoices", "to": "/billing", "label": "Billing invoices", "text": ["channel", "currency", "invoice_no", "notes", "reference", "status"], "enums": {"billing_cycle": Constants.public.Enums.billing_cycle}, "numbers": ["amount"], "refs": [], "dates": {"paid_on": "date", "period_end": "date", "period_start": "date"}},
  {"table": "subscriptions", "to": "/billing", "label": "Subscriptions", "text": ["billing_email", "payment_channel", "provider"], "enums": {"billing_cycle": Constants.public.Enums.billing_cycle, "status": Constants.public.Enums.subscription_status}, "numbers": [], "refs": [], "dates": {"current_period_end": "timestamp with time zone", "current_period_start": "timestamp with time zone"}},
  {"table": "tenants", "to": "/platform", "label": "Institutions", "text": ["custom_domain", "name", "slug"], "enums": {"academic_system": Constants.public.Enums.academic_system, "custom_domain_status": Constants.public.Enums.custom_domain_status, "status": Constants.public.Enums.tenant_status}, "numbers": [], "refs": [], "dates": {}},
  {"table": "plan_tiers", "to": "/platform", "label": "Plans", "text": ["description", "name"], "enums": {}, "numbers": ["ai_message_limit", "campus_limit", "price_monthly_pkr", "price_monthly_usd", "price_yearly_pkr", "price_yearly_usd", "sort_order", "staff_limit", "student_limit"], "refs": [], "dates": {}},
  {"table": "signup_requests", "to": "/platform", "label": "Signup requests", "text": ["city", "contact_name", "email", "institution_name", "phone", "requested_slug", "status"], "enums": {"academic_system": Constants.public.Enums.academic_system}, "numbers": [], "refs": [], "dates": {}},
  {"table": "ai_threads", "to": "/assistant", "label": "Conversations", "text": ["title"], "enums": {}, "numbers": [], "refs": [], "dates": {}},
];

export function accessibleSources(paths: readonly string[]) {
  const direct = SEARCH_SOURCES.filter((source) => paths.includes(source.to));
  if (!paths.includes("/portal")) return direct;
  // Portal readers still use the same RLS-protected queries; route previews back to their portal.
  const portalTables = ["students", "homework_entries", "notices", "fee_challans", "report_cards", "attendance_records", "timetable_entries", "timetable_periods"];
  return [...direct, ...SEARCH_SOURCES.filter((s) => portalTables.includes(s.table) && !direct.includes(s)).map((s) => ({ ...s, to: "/portal" }))];
}

/** Remove PostgREST grammar and wildcard characters; keep Unicode names and ordinary punctuation. */
export function searchWords(query: string): string[] {
  return query.replace(/[,%_()."\\*]/g, " ").trim().slice(0, 120).split(/\s+/).filter(Boolean).slice(0, 8);
}

export function slashShouldToggle(event: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; repeat?: boolean; isComposing?: boolean }, open: boolean, editable: boolean, searchInput: boolean) {
  if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.isComposing) return false;
  return !editable || (open && searchInput);
}

export type SearchRecord = { id: string; source: SearchSource; fields: Record<string, unknown> };

export function recordTitle(record: SearchRecord) {
  const f = record.fields;
  const name = [f["first_name"], f["last_name"]].filter(Boolean).join(" ");
  return name || String(f["title"] || f["name"] || f["student_name"] || f["full_name"] || f["institution_name"] || f["challan_no"] || f["voucher_no"] || f["invoice_no"] || f["reference_no"] || f["subject_name"] || f["subject"] || f["label"] || f["payee"] || f["description"] || f["date"] || f["term"] || f["registration_no"] || record.source.label);
}
