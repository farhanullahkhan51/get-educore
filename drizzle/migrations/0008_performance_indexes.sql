CREATE INDEX IF NOT EXISTS idx_students_scope_status ON public.students (tenant_id, campus_id, status);
CREATE INDEX IF NOT EXISTS idx_students_section ON public.students (section_id);
CREATE INDEX IF NOT EXISTS idx_challans_scope_status_due ON public.fee_challans (tenant_id, campus_id, status, due_date);