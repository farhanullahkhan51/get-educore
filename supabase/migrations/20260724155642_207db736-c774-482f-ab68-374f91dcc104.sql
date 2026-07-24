
DO $$
DECLARE
  default_tenant CONSTANT uuid := 'dfaaa059-974f-4ba9-b4fc-5ce57171d44b';
  tbl text;
  tables text[] := ARRAY[
    'campuses','programs','classes','sections','students','staff','staff_payroll',
    'profiles','user_roles','inquiries','courses','course_assignments',
    'attendance_records','assessments','assessment_scores','grading_scales','report_cards',
    'fee_structures','fee_challans','fee_ledger','bank_accounts','bank_transactions',
    'scholarships','board_registrations','board_exam_entries','board_results','audit_logs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE', tbl);
    EXECUTE format('UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL', tbl, default_tenant);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', tbl);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT %L', tbl, default_tenant);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(tenant_id)', tbl || '_tenant_id_idx', tbl);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_user_tenant(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT tenant_id FROM public.profiles WHERE id = _user_id $$;
