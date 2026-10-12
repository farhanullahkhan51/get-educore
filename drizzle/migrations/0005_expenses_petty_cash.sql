CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  campus_id uuid NOT NULL REFERENCES public.campuses(id),
  voucher_no text,
  entry_type text NOT NULL DEFAULT 'expense' CHECK (entry_type IN ('expense','petty_topup')),
  category text NOT NULL DEFAULT 'other',
  payee text NOT NULL DEFAULT '',
  payment_mode text NOT NULL DEFAULT 'cash' CHECK (payment_mode IN ('cash','bank_transfer','cheque','petty_cash')),
  reference text,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  tax_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  expense_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected','paid')),
  description text NOT NULL DEFAULT '',
  receipt_url text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, voucher_no)
);
CREATE INDEX expenses_scope_idx ON public.expenses (tenant_id, campus_id, expense_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.expenses_fill_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  SELECT c.tenant_id INTO NEW.tenant_id FROM public.campuses c WHERE c.id = NEW.campus_id;
  IF NEW.tenant_id IS NULL THEN RAISE EXCEPTION 'Unknown campus'; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    PERFORM pg_advisory_xact_lock(hashtext('expense-voucher-' || NEW.tenant_id::text));
    SELECT count(*) + 1 INTO _n FROM public.expenses WHERE tenant_id = NEW.tenant_id
      AND voucher_no LIKE 'EXP-' || to_char(NEW.expense_date,'YYYY') || '-%';
    NEW.voucher_no := 'EXP-' || to_char(NEW.expense_date,'YYYY') || '-' || lpad(_n::text, 4, '0');
    IF NEW.status <> 'draft' THEN NEW.status := 'draft'; END IF;
    NEW.approved_by := NULL; NEW.approved_at := NULL; NEW.paid_at := NULL;
  ELSE
    NEW.created_by := OLD.created_by; NEW.voucher_no := OLD.voucher_no;
    IF OLD.status = 'paid' AND (NEW.amount <> OLD.amount OR NEW.tax_amount <> OLD.tax_amount OR NEW.status <> 'paid' OR NEW.campus_id <> OLD.campus_id OR NEW.payment_mode <> OLD.payment_mode OR NEW.entry_type <> OLD.entry_type) THEN
      RAISE EXCEPTION 'Paid vouchers are locked';
    END IF;
    IF NEW.status = 'paid' AND OLD.status NOT IN ('approved','paid') THEN
      RAISE EXCEPTION 'Approve the voucher before marking it paid';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status IN ('approved','rejected') THEN NEW.approved_by := auth.uid(); NEW.approved_at := now(); END IF;
      IF NEW.status = 'paid' THEN NEW.paid_at := now(); END IF;
      IF NEW.status = 'draft' THEN NEW.approved_by := NULL; NEW.approved_at := NULL; END IF;
    ELSE
      NEW.approved_by := OLD.approved_by; NEW.approved_at := OLD.approved_at; NEW.paid_at := OLD.paid_at;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER expenses_fill_scope BEFORE INSERT OR UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.expenses_fill_scope();
CREATE TRIGGER expenses_tenant_writable BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable();

CREATE POLICY "Finance staff read expenses" ON public.expenses FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.can_manage_fees(auth.uid(), campus_id));
CREATE POLICY "Finance staff add expenses" ON public.expenses FOR INSERT TO authenticated
WITH CHECK (public.can_manage_fees(auth.uid(), campus_id));
CREATE POLICY "Finance staff update expenses" ON public.expenses FOR UPDATE TO authenticated
USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.can_manage_fees(auth.uid(), campus_id))
WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND public.can_manage_fees(auth.uid(), campus_id));
CREATE POLICY "Finance staff delete draft expenses" ON public.expenses FOR DELETE TO authenticated
USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.can_manage_fees(auth.uid(), campus_id) AND status IN ('draft','rejected'));

CREATE OR REPLACE FUNCTION public.finance_pnl_monthly(_campus uuid DEFAULT NULL, _months integer DEFAULT 6)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _tenant uuid := public.get_user_tenant(auth.uid()); _r jsonb;
BEGIN
  IF auth.uid() IS NULL OR _tenant IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF _months < 1 OR _months > 36 THEN RAISE EXCEPTION 'Months must be between 1 and 36'; END IF;
  IF _campus IS NOT NULL AND NOT public.has_campus_access(auth.uid(), _campus) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF NOT (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'campus_admin') OR public.has_role(auth.uid(),'finance_officer')) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF NOT public.is_super_admin(auth.uid()) THEN _campus := public.get_user_campus(auth.uid()); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('month', to_char(m.ms,'YYYY-MM'),
    'income', coalesce(i.v,0), 'expense', coalesce(e.v,0), 'net', coalesce(i.v,0)-coalesce(e.v,0)) ORDER BY m.ms),'[]'::jsonb)
  INTO _r
  FROM generate_series(date_trunc('month',current_date)-((_months-1)||' months')::interval, date_trunc('month',current_date), '1 month') m(ms)
  LEFT JOIN LATERAL (SELECT sum(paid_amount) v FROM public.fee_challans f WHERE f.tenant_id=_tenant AND (_campus IS NULL OR f.campus_id=_campus)
     AND f.issue_date >= m.ms::date AND f.issue_date < (m.ms + interval '1 month')::date) i ON true
  LEFT JOIN LATERAL (SELECT sum(amount + tax_amount) v FROM public.expenses x WHERE x.tenant_id=_tenant AND (_campus IS NULL OR x.campus_id=_campus)
     AND x.entry_type='expense' AND x.status IN ('approved','paid')
     AND x.expense_date >= m.ms::date AND x.expense_date < (m.ms + interval '1 month')::date) e ON true;
  RETURN _r;
END $$;
REVOKE ALL ON FUNCTION public.finance_pnl_monthly(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_pnl_monthly(uuid, integer) TO authenticated;