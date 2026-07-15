
-- Enums
CREATE TYPE public.fee_frequency AS ENUM ('monthly','term','annual','one_time');
CREATE TYPE public.fee_category AS ENUM ('tuition','admission','exam','transport','hostel','other');
CREATE TYPE public.challan_status AS ENUM ('unpaid','partial','paid','waived','overdue');
CREATE TYPE public.scholarship_type AS ENUM ('percentage','fixed');
CREATE TYPE public.scholarship_status AS ENUM ('active','expired','revoked');

-- Helper: is finance/admin on campus
CREATE OR REPLACE FUNCTION public.can_manage_fees(_user_id uuid, _campus_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_super_admin(_user_id)
    OR (public.get_user_campus(_user_id) = _campus_id
        AND (public.has_role(_user_id,'campus_admin')
          OR public.has_role(_user_id,'finance_officer')));
$$;

-- fee_structures
CREATE TABLE public.fee_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  name text NOT NULL,
  category public.fee_category NOT NULL DEFAULT 'tuition',
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  frequency public.fee_frequency NOT NULL DEFAULT 'monthly',
  academic_year text,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_structures TO authenticated;
GRANT ALL ON public.fee_structures TO service_role;
ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fee_structures_read" ON public.fee_structures FOR SELECT TO authenticated
  USING (public.has_campus_access(auth.uid(), campus_id));
CREATE POLICY "fee_structures_write" ON public.fee_structures FOR ALL TO authenticated
  USING (public.can_manage_fees(auth.uid(), campus_id))
  WITH CHECK (public.can_manage_fees(auth.uid(), campus_id));
CREATE TRIGGER trg_fee_structures_updated BEFORE UPDATE ON public.fee_structures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- bank_accounts
CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  bank_name text NOT NULL,
  account_title text NOT NULL,
  account_number text NOT NULL,
  iban text,
  branch text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_accounts_read" ON public.bank_accounts FOR SELECT TO authenticated
  USING (public.has_campus_access(auth.uid(), campus_id));
CREATE POLICY "bank_accounts_write" ON public.bank_accounts FOR ALL TO authenticated
  USING (public.can_manage_fees(auth.uid(), campus_id))
  WITH CHECK (public.can_manage_fees(auth.uid(), campus_id));
CREATE TRIGGER trg_bank_accounts_updated BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- scholarships
CREATE TABLE public.scholarships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  name text NOT NULL,
  scholarship_type public.scholarship_type NOT NULL DEFAULT 'percentage',
  value numeric(12,2) NOT NULL CHECK (value >= 0),
  reason text,
  status public.scholarship_status NOT NULL DEFAULT 'active',
  starts_on date,
  ends_on date,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scholarships TO authenticated;
GRANT ALL ON public.scholarships TO service_role;
ALTER TABLE public.scholarships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scholarships_staff_read" ON public.scholarships FOR SELECT TO authenticated
  USING (public.has_campus_access(auth.uid(), campus_id));
CREATE POLICY "scholarships_staff_write" ON public.scholarships FOR ALL TO authenticated
  USING (public.can_manage_fees(auth.uid(), campus_id))
  WITH CHECK (public.can_manage_fees(auth.uid(), campus_id));
CREATE TRIGGER trg_scholarships_updated BEFORE UPDATE ON public.scholarships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- fee_challans
CREATE TABLE public.fee_challans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_no text NOT NULL UNIQUE,
  campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  fee_structure_id uuid REFERENCES public.fee_structures(id) ON DELETE SET NULL,
  scholarship_id uuid REFERENCES public.scholarships(id) ON DELETE SET NULL,
  category public.fee_category NOT NULL DEFAULT 'tuition',
  period_label text,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  gross_amount numeric(12,2) NOT NULL CHECK (gross_amount >= 0),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  fine_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (fine_amount >= 0),
  paid_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status public.challan_status NOT NULL DEFAULT 'unpaid',
  paid_on date,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_challans_student ON public.fee_challans(student_id);
CREATE INDEX idx_challans_campus_status ON public.fee_challans(campus_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_challans TO authenticated;
GRANT ALL ON public.fee_challans TO service_role;
ALTER TABLE public.fee_challans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "challans_staff_read" ON public.fee_challans FOR SELECT TO authenticated
  USING (public.has_campus_access(auth.uid(), campus_id));
CREATE POLICY "challans_student_read" ON public.fee_challans FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = fee_challans.student_id AND s.profile_id = auth.uid()));
CREATE POLICY "challans_write" ON public.fee_challans FOR ALL TO authenticated
  USING (public.can_manage_fees(auth.uid(), campus_id))
  WITH CHECK (public.can_manage_fees(auth.uid(), campus_id));
CREATE TRIGGER trg_challans_updated BEFORE UPDATE ON public.fee_challans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- bank_transactions
CREATE TABLE public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  txn_date date NOT NULL,
  reference text,
  description text,
  amount numeric(12,2) NOT NULL,
  matched_challan_id uuid REFERENCES public.fee_challans(id) ON DELETE SET NULL,
  matched_at timestamptz,
  matched_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  import_batch text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bank_txn_campus ON public.bank_transactions(campus_id, txn_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_transactions TO service_role;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_txn_read" ON public.bank_transactions FOR SELECT TO authenticated
  USING (public.has_campus_access(auth.uid(), campus_id));
CREATE POLICY "bank_txn_write" ON public.bank_transactions FOR ALL TO authenticated
  USING (public.can_manage_fees(auth.uid(), campus_id))
  WITH CHECK (public.can_manage_fees(auth.uid(), campus_id));
CREATE TRIGGER trg_bank_txn_updated BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- fee_ledger (audit / payment history)
CREATE TABLE public.fee_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  challan_id uuid NOT NULL REFERENCES public.fee_challans(id) ON DELETE CASCADE,
  entry_type text NOT NULL,
  amount numeric(12,2) NOT NULL,
  bank_transaction_id uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.fee_ledger TO authenticated;
GRANT ALL ON public.fee_ledger TO service_role;
ALTER TABLE public.fee_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger_staff_read" ON public.fee_ledger FOR SELECT TO authenticated
  USING (public.has_campus_access(auth.uid(), campus_id));
CREATE POLICY "ledger_student_read" ON public.fee_ledger FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fee_challans c JOIN public.students s ON s.id = c.student_id
                 WHERE c.id = fee_ledger.challan_id AND s.profile_id = auth.uid()));
CREATE POLICY "ledger_insert" ON public.fee_ledger FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_fees(auth.uid(), campus_id));
