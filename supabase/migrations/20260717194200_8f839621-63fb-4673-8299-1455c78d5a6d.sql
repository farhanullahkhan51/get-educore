
-- Add guardian_occupation to students
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS guardian_occupation TEXT;

-- Staff payroll: salary, bonuses, increments
CREATE TABLE IF NOT EXISTS public.staff_payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('salary','bonus','increment','deduction')),
  amount NUMERIC(12,2) NOT NULL,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_payroll TO authenticated;
GRANT ALL ON public.staff_payroll TO service_role;

ALTER TABLE public.staff_payroll ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_manage_by_admin_finance" ON public.staff_payroll
  FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.can_manage_fees(auth.uid(), campus_id)
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.can_manage_fees(auth.uid(), campus_id)
  );

CREATE TRIGGER update_staff_payroll_updated_at
  BEFORE UPDATE ON public.staff_payroll
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_staff_payroll_staff ON public.staff_payroll(staff_id);
