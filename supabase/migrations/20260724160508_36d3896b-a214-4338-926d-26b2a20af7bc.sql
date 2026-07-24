
-- Step 3: layer tenant_id check in front of every existing authenticated RLS policy.
-- Anon policies (public campus/program read, public inquiry submission) are left unchanged
-- because anonymous callers have no user tenant; tenant_id defaults on insert ensure new rows
-- still land on the default tenant.

-- Helper macro not available; inline get_user_tenant(auth.uid()) = tenant_id everywhere.

-- ============ assessment_scores ============
DROP POLICY IF EXISTS "scores read" ON public.assessment_scores;
CREATE POLICY "scores read" ON public.assessment_scores FOR SELECT TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND (
  has_campus_access(auth.uid(), campus_id)
  OR EXISTS (SELECT 1 FROM assessments a WHERE a.id = assessment_scores.assessment_id AND teacher_of_course_section(auth.uid(), a.course_id, a.section_id))
  OR is_student_owner(auth.uid(), student_id)
));

DROP POLICY IF EXISTS "scores write teacher/admin" ON public.assessment_scores;
CREATE POLICY "scores write teacher/admin" ON public.assessment_scores FOR ALL TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (get_user_campus(auth.uid()) = campus_id AND has_role(auth.uid(), 'campus_admin'::app_role))
  OR EXISTS (SELECT 1 FROM assessments a WHERE a.id = assessment_scores.assessment_id AND teacher_of_course_section(auth.uid(), a.course_id, a.section_id))
))
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (get_user_campus(auth.uid()) = campus_id AND has_role(auth.uid(), 'campus_admin'::app_role))
  OR EXISTS (SELECT 1 FROM assessments a WHERE a.id = assessment_scores.assessment_id AND teacher_of_course_section(auth.uid(), a.course_id, a.section_id))
));

-- ============ assessments ============
DROP POLICY IF EXISTS "assessments read" ON public.assessments;
CREATE POLICY "assessments read" ON public.assessments FOR SELECT TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND (
  has_campus_access(auth.uid(), campus_id)
  OR teacher_of_course_section(auth.uid(), course_id, section_id)
  OR EXISTS (SELECT 1 FROM students st WHERE st.section_id = assessments.section_id AND st.profile_id = auth.uid())
));

DROP POLICY IF EXISTS "assessments write teacher/admin" ON public.assessments;
CREATE POLICY "assessments write teacher/admin" ON public.assessments FOR ALL TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (get_user_campus(auth.uid()) = campus_id AND has_role(auth.uid(), 'campus_admin'::app_role))
  OR teacher_of_course_section(auth.uid(), course_id, section_id)
))
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (get_user_campus(auth.uid()) = campus_id AND has_role(auth.uid(), 'campus_admin'::app_role))
  OR teacher_of_course_section(auth.uid(), course_id, section_id)
));

-- ============ attendance_records ============
DROP POLICY IF EXISTS "attendance read" ON public.attendance_records;
CREATE POLICY "attendance read" ON public.attendance_records FOR SELECT TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND (
  has_campus_access(auth.uid(), campus_id)
  OR teacher_of_section(auth.uid(), section_id)
  OR is_student_owner(auth.uid(), student_id)
));

DROP POLICY IF EXISTS "attendance write teacher/admin" ON public.attendance_records;
CREATE POLICY "attendance write teacher/admin" ON public.attendance_records FOR ALL TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (get_user_campus(auth.uid()) = campus_id AND has_role(auth.uid(), 'campus_admin'::app_role))
  OR teacher_of_section(auth.uid(), section_id)
))
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (get_user_campus(auth.uid()) = campus_id AND has_role(auth.uid(), 'campus_admin'::app_role))
  OR teacher_of_section(auth.uid(), section_id)
));

-- ============ audit_logs ============
DROP POLICY IF EXISTS "audit_logs_insert_authenticated" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_authenticated" ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND actor_id = auth.uid());

DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs FOR SELECT TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'campus_admin'::app_role) AND campus_id = get_user_campus(auth.uid()))
));

-- ============ bank_accounts ============
DROP POLICY IF EXISTS "bank_accounts_read" ON public.bank_accounts;
CREATE POLICY "bank_accounts_read" ON public.bank_accounts FOR SELECT TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND has_campus_access(auth.uid(), campus_id));

DROP POLICY IF EXISTS "bank_accounts_write" ON public.bank_accounts;
CREATE POLICY "bank_accounts_write" ON public.bank_accounts FOR ALL TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND can_manage_fees(auth.uid(), campus_id))
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND can_manage_fees(auth.uid(), campus_id));

-- ============ bank_transactions ============
DROP POLICY IF EXISTS "bank_txn_read" ON public.bank_transactions;
CREATE POLICY "bank_txn_read" ON public.bank_transactions FOR SELECT TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND has_campus_access(auth.uid(), campus_id));

DROP POLICY IF EXISTS "bank_txn_write" ON public.bank_transactions;
CREATE POLICY "bank_txn_write" ON public.bank_transactions FOR ALL TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND can_manage_fees(auth.uid(), campus_id))
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND can_manage_fees(auth.uid(), campus_id));

-- ============ board_exam_entries ============
DROP POLICY IF EXISTS "board_entries via reg" ON public.board_exam_entries;
CREATE POLICY "board_entries via reg" ON public.board_exam_entries FOR ALL TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND EXISTS (
  SELECT 1 FROM board_registrations r
  WHERE r.id = board_exam_entries.registration_id
    AND (has_campus_access(auth.uid(), r.campus_id) OR is_student_owner(auth.uid(), r.student_id))
))
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND EXISTS (
  SELECT 1 FROM board_registrations r
  WHERE r.id = board_exam_entries.registration_id
    AND has_campus_access(auth.uid(), r.campus_id)
));

-- ============ board_registrations ============
DROP POLICY IF EXISTS "board_reg campus access" ON public.board_registrations;
CREATE POLICY "board_reg campus access" ON public.board_registrations FOR ALL TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND (
  has_campus_access(auth.uid(), campus_id) OR is_student_owner(auth.uid(), student_id)
))
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND has_campus_access(auth.uid(), campus_id));

-- ============ board_results ============
DROP POLICY IF EXISTS "board_results via reg" ON public.board_results;
CREATE POLICY "board_results via reg" ON public.board_results FOR ALL TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND EXISTS (
  SELECT 1 FROM board_exam_entries e JOIN board_registrations r ON r.id = e.registration_id
  WHERE e.id = board_results.entry_id
    AND (has_campus_access(auth.uid(), r.campus_id) OR is_student_owner(auth.uid(), r.student_id))
))
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND EXISTS (
  SELECT 1 FROM board_exam_entries e JOIN board_registrations r ON r.id = e.registration_id
  WHERE e.id = board_results.entry_id AND has_campus_access(auth.uid(), r.campus_id)
));

-- ============ campuses ============
-- keep anon public read as-is. Restrict authenticated reads and writes to same tenant.
DROP POLICY IF EXISTS "campuses_select_all_authenticated" ON public.campuses;
CREATE POLICY "campuses_select_all_authenticated" ON public.campuses FOR SELECT TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id);

DROP POLICY IF EXISTS "campuses_super_admin_all" ON public.campuses;
CREATE POLICY "campuses_super_admin_all" ON public.campuses FOR ALL TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND is_super_admin(auth.uid()))
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND is_super_admin(auth.uid()));

-- ============ classes ============
DROP POLICY IF EXISTS "classes_manage_admin" ON public.classes;
CREATE POLICY "classes_manage_admin" ON public.classes FOR ALL TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'campus_admin'::app_role) AND campus_id = get_user_campus(auth.uid()))
))
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'campus_admin'::app_role) AND campus_id = get_user_campus(auth.uid()))
));

DROP POLICY IF EXISTS "classes_select_campus" ON public.classes;
CREATE POLICY "classes_select_campus" ON public.classes FOR SELECT TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND has_campus_access(auth.uid(), campus_id));

-- ============ course_assignments ============
DROP POLICY IF EXISTS "assignments admin write" ON public.course_assignments;
CREATE POLICY "assignments admin write" ON public.course_assignments FOR ALL TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (get_user_campus(auth.uid()) = campus_id AND has_role(auth.uid(), 'campus_admin'::app_role))
))
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (get_user_campus(auth.uid()) = campus_id AND has_role(auth.uid(), 'campus_admin'::app_role))
));

DROP POLICY IF EXISTS "assignments read same campus" ON public.course_assignments;
CREATE POLICY "assignments read same campus" ON public.course_assignments FOR SELECT TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND has_campus_access(auth.uid(), campus_id));

-- ============ courses ============
DROP POLICY IF EXISTS "courses admin write" ON public.courses;
CREATE POLICY "courses admin write" ON public.courses FOR ALL TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (get_user_campus(auth.uid()) = campus_id AND has_role(auth.uid(), 'campus_admin'::app_role))
))
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (get_user_campus(auth.uid()) = campus_id AND has_role(auth.uid(), 'campus_admin'::app_role))
));

DROP POLICY IF EXISTS "courses read same campus" ON public.courses;
CREATE POLICY "courses read same campus" ON public.courses FOR SELECT TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND has_campus_access(auth.uid(), campus_id));

-- ============ fee_challans ============
DROP POLICY IF EXISTS "challans_staff_read" ON public.fee_challans;
CREATE POLICY "challans_staff_read" ON public.fee_challans FOR SELECT TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND has_campus_access(auth.uid(), campus_id));

DROP POLICY IF EXISTS "challans_student_read" ON public.fee_challans;
CREATE POLICY "challans_student_read" ON public.fee_challans FOR SELECT TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND EXISTS (
  SELECT 1 FROM students s WHERE s.id = fee_challans.student_id AND s.profile_id = auth.uid()
));

DROP POLICY IF EXISTS "challans_write" ON public.fee_challans;
CREATE POLICY "challans_write" ON public.fee_challans FOR ALL TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND can_manage_fees(auth.uid(), campus_id))
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND can_manage_fees(auth.uid(), campus_id));

-- ============ fee_ledger ============
DROP POLICY IF EXISTS "ledger_insert" ON public.fee_ledger;
CREATE POLICY "ledger_insert" ON public.fee_ledger FOR INSERT TO authenticated
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND can_manage_fees(auth.uid(), campus_id));

DROP POLICY IF EXISTS "ledger_staff_read" ON public.fee_ledger;
CREATE POLICY "ledger_staff_read" ON public.fee_ledger FOR SELECT TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND has_campus_access(auth.uid(), campus_id));

DROP POLICY IF EXISTS "ledger_student_read" ON public.fee_ledger;
CREATE POLICY "ledger_student_read" ON public.fee_ledger FOR SELECT TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND EXISTS (
  SELECT 1 FROM fee_challans c JOIN students s ON s.id = c.student_id
  WHERE c.id = fee_ledger.challan_id AND s.profile_id = auth.uid()
));

-- ============ fee_structures ============
DROP POLICY IF EXISTS "fee_structures_read" ON public.fee_structures;
CREATE POLICY "fee_structures_read" ON public.fee_structures FOR SELECT TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND has_campus_access(auth.uid(), campus_id));

DROP POLICY IF EXISTS "fee_structures_write" ON public.fee_structures;
CREATE POLICY "fee_structures_write" ON public.fee_structures FOR ALL TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND can_manage_fees(auth.uid(), campus_id))
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND can_manage_fees(auth.uid(), campus_id));

-- ============ grading_scales ============
DROP POLICY IF EXISTS "grading admin write" ON public.grading_scales;
CREATE POLICY "grading admin write" ON public.grading_scales FOR ALL TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (campus_id IS NOT NULL AND get_user_campus(auth.uid()) = campus_id AND has_role(auth.uid(), 'campus_admin'::app_role))
))
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (campus_id IS NOT NULL AND get_user_campus(auth.uid()) = campus_id AND has_role(auth.uid(), 'campus_admin'::app_role))
));

DROP POLICY IF EXISTS "grading read" ON public.grading_scales;
CREATE POLICY "grading read" ON public.grading_scales FOR SELECT TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND (campus_id IS NULL OR has_campus_access(auth.uid(), campus_id)));

-- ============ inquiries ============
DROP POLICY IF EXISTS "Admins may delete inquiries" ON public.inquiries;
CREATE POLICY "Admins may delete inquiries" ON public.inquiries FOR DELETE TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid()) OR has_role(auth.uid(), 'campus_admin'::app_role)
));

DROP POLICY IF EXISTS "Admissions staff may update inquiries" ON public.inquiries;
CREATE POLICY "Admissions staff may update inquiries" ON public.inquiries FOR UPDATE TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR ((has_role(auth.uid(), 'campus_admin'::app_role) OR has_role(auth.uid(), 'admissions_officer'::app_role))
      AND (campus_id IS NULL OR has_campus_access(auth.uid(), campus_id)))
));

DROP POLICY IF EXISTS "Admissions staff may view inquiries" ON public.inquiries;
CREATE POLICY "Admissions staff may view inquiries" ON public.inquiries FOR SELECT TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR ((has_role(auth.uid(), 'campus_admin'::app_role) OR has_role(auth.uid(), 'admissions_officer'::app_role))
      AND (campus_id IS NULL OR has_campus_access(auth.uid(), campus_id)))
));

DROP POLICY IF EXISTS "Staff may create inquiries" ON public.inquiries;
CREATE POLICY "Staff may create inquiries" ON public.inquiries FOR INSERT TO authenticated
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid()) OR has_role(auth.uid(), 'campus_admin'::app_role) OR has_role(auth.uid(), 'admissions_officer'::app_role)
));

-- ============ profiles ============
-- profiles_insert_self: keep self-insert path (id = auth.uid()); super_admin insert must match tenant.
DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated
WITH CHECK (
  id = auth.uid()
  OR (public.get_user_tenant(auth.uid()) = tenant_id AND is_super_admin(auth.uid()))
);

DROP POLICY IF EXISTS "profiles_select_self" ON public.profiles;
CREATE POLICY "profiles_select_self" ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR (public.get_user_tenant(auth.uid()) = tenant_id AND (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'campus_admin'::app_role) AND campus_id = get_user_campus(auth.uid()))
    OR (has_role(auth.uid(), 'teacher'::app_role) AND campus_id = get_user_campus(auth.uid()))
    OR (has_role(auth.uid(), 'admissions_officer'::app_role) AND campus_id = get_user_campus(auth.uid()))
    OR (has_role(auth.uid(), 'finance_officer'::app_role) AND campus_id = get_user_campus(auth.uid()))
  ))
);

DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated
USING (
  id = auth.uid()
  OR (public.get_user_tenant(auth.uid()) = tenant_id AND (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'campus_admin'::app_role) AND campus_id = get_user_campus(auth.uid()))
  ))
)
WITH CHECK (
  id = auth.uid()
  OR (public.get_user_tenant(auth.uid()) = tenant_id AND (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'campus_admin'::app_role) AND campus_id = get_user_campus(auth.uid()))
  ))
);

-- ============ programs ============
DROP POLICY IF EXISTS "programs_manage_admin" ON public.programs;
CREATE POLICY "programs_manage_admin" ON public.programs FOR ALL TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'campus_admin'::app_role) AND campus_id = get_user_campus(auth.uid()))
))
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'campus_admin'::app_role) AND campus_id = get_user_campus(auth.uid()))
));

DROP POLICY IF EXISTS "programs_select_campus" ON public.programs;
CREATE POLICY "programs_select_campus" ON public.programs FOR SELECT TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND has_campus_access(auth.uid(), campus_id));

-- ============ report_cards ============
DROP POLICY IF EXISTS "report_cards admin write" ON public.report_cards;
CREATE POLICY "report_cards admin write" ON public.report_cards FOR ALL TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (get_user_campus(auth.uid()) = campus_id AND has_role(auth.uid(), 'campus_admin'::app_role))
))
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (get_user_campus(auth.uid()) = campus_id AND has_role(auth.uid(), 'campus_admin'::app_role))
));

DROP POLICY IF EXISTS "report_cards read" ON public.report_cards;
CREATE POLICY "report_cards read" ON public.report_cards FOR SELECT TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND (
  has_campus_access(auth.uid(), campus_id)
  OR (status = 'published'::report_card_status AND is_student_owner(auth.uid(), student_id))
));

-- ============ scholarships ============
DROP POLICY IF EXISTS "scholarships_staff_read" ON public.scholarships;
CREATE POLICY "scholarships_staff_read" ON public.scholarships FOR SELECT TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND has_campus_access(auth.uid(), campus_id));

DROP POLICY IF EXISTS "scholarships_staff_write" ON public.scholarships;
CREATE POLICY "scholarships_staff_write" ON public.scholarships FOR ALL TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND can_manage_fees(auth.uid(), campus_id))
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND can_manage_fees(auth.uid(), campus_id));

-- ============ sections ============
DROP POLICY IF EXISTS "sections_manage_admin" ON public.sections;
CREATE POLICY "sections_manage_admin" ON public.sections FOR ALL TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'campus_admin'::app_role) AND campus_id = get_user_campus(auth.uid()))
))
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'campus_admin'::app_role) AND campus_id = get_user_campus(auth.uid()))
));

DROP POLICY IF EXISTS "sections_select_campus" ON public.sections;
CREATE POLICY "sections_select_campus" ON public.sections FOR SELECT TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND has_campus_access(auth.uid(), campus_id));

-- ============ staff ============
DROP POLICY IF EXISTS "staff_manage_admin" ON public.staff;
CREATE POLICY "staff_manage_admin" ON public.staff FOR ALL TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'campus_admin'::app_role) AND campus_id = get_user_campus(auth.uid()))
))
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'campus_admin'::app_role) AND campus_id = get_user_campus(auth.uid()))
));

DROP POLICY IF EXISTS "staff_select_scoped" ON public.staff;
CREATE POLICY "staff_select_scoped" ON public.staff FOR SELECT TO authenticated
USING (
  profile_id = auth.uid()
  OR (public.get_user_tenant(auth.uid()) = tenant_id AND (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'campus_admin'::app_role) AND campus_id = get_user_campus(auth.uid()))
    OR (has_role(auth.uid(), 'admissions_officer'::app_role) AND campus_id = get_user_campus(auth.uid()))
    OR (has_role(auth.uid(), 'finance_officer'::app_role) AND campus_id = get_user_campus(auth.uid()))
  ))
);

-- ============ staff_payroll ============
DROP POLICY IF EXISTS "payroll_manage_by_admin_finance" ON public.staff_payroll;
CREATE POLICY "payroll_manage_by_admin_finance" ON public.staff_payroll FOR ALL TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid()) OR can_manage_fees(auth.uid(), campus_id)
))
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid()) OR can_manage_fees(auth.uid(), campus_id)
));

-- ============ students ============
DROP POLICY IF EXISTS "students_manage_admin" ON public.students;
CREATE POLICY "students_manage_admin" ON public.students FOR ALL TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'campus_admin'::app_role) AND campus_id = get_user_campus(auth.uid()))
  OR (has_role(auth.uid(), 'admissions_officer'::app_role) AND campus_id = get_user_campus(auth.uid()))
))
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND (
  is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'campus_admin'::app_role) AND campus_id = get_user_campus(auth.uid()))
  OR (has_role(auth.uid(), 'admissions_officer'::app_role) AND campus_id = get_user_campus(auth.uid()))
));

DROP POLICY IF EXISTS "students_select_scoped" ON public.students;
CREATE POLICY "students_select_scoped" ON public.students FOR SELECT TO authenticated
USING (
  profile_id = auth.uid()
  OR (public.get_user_tenant(auth.uid()) = tenant_id AND (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'campus_admin'::app_role) AND campus_id = get_user_campus(auth.uid()))
    OR (has_role(auth.uid(), 'admissions_officer'::app_role) AND campus_id = get_user_campus(auth.uid()))
    OR (has_role(auth.uid(), 'finance_officer'::app_role) AND campus_id = get_user_campus(auth.uid()))
    OR (has_role(auth.uid(), 'teacher'::app_role) AND campus_id = get_user_campus(auth.uid()))
  ))
);

-- ============ user_roles ============
DROP POLICY IF EXISTS "user_roles_select_self_or_admin" ON public.user_roles;
CREATE POLICY "user_roles_select_self_or_admin" ON public.user_roles FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (public.get_user_tenant(auth.uid()) = tenant_id AND (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'campus_admin'::app_role) AND campus_id = get_user_campus(auth.uid()))
  ))
);

DROP POLICY IF EXISTS "user_roles_super_admin_manage" ON public.user_roles;
CREATE POLICY "user_roles_super_admin_manage" ON public.user_roles FOR ALL TO authenticated
USING (public.get_user_tenant(auth.uid()) = tenant_id AND is_super_admin(auth.uid()))
WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND is_super_admin(auth.uid()));
