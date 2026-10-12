ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'statement',
  ADD COLUMN IF NOT EXISTS external_txn_id text,
  ADD COLUMN IF NOT EXISTS match_status text NOT NULL DEFAULT 'unmatched',
  ADD COLUMN IF NOT EXISTS match_note text,
  ADD COLUMN IF NOT EXISTS applied_amount numeric NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_external_uidx
  ON public.bank_transactions (tenant_id, external_txn_id) WHERE external_txn_id IS NOT NULL;

UPDATE public.bank_transactions SET match_status = 'matched' WHERE matched_challan_id IS NOT NULL AND match_status = 'unmatched';

-- Atomic, idempotent settlement of one bank transaction against one challan.
CREATE OR REPLACE FUNCTION public.apply_bank_payment(_txn_id uuid, _challan_id uuid, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.bank_transactions; c public.fee_challans; net numeric; outstanding numeric; applied numeric; st text;
BEGIN
  SELECT * INTO t FROM public.bank_transactions WHERE id = _txn_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF coalesce(auth.role(),'') <> 'service_role' AND NOT public.can_manage_fees(auth.uid(), t.campus_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF t.matched_challan_id IS NOT NULL THEN
    RETURN jsonb_build_object('status','already_matched','challan_id',t.matched_challan_id);
  END IF;
  SELECT * INTO c FROM public.fee_challans WHERE id = _challan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Challan not found'; END IF;
  IF c.campus_id <> t.campus_id THEN RAISE EXCEPTION 'Challan belongs to another campus'; END IF;
  IF c.status = 'waived' THEN RAISE EXCEPTION 'Challan is waived'; END IF;
  net := greatest(c.gross_amount - c.discount_amount + c.fine_amount, 0);
  outstanding := greatest(net - c.paid_amount, 0);
  IF outstanding <= 0 THEN RAISE EXCEPTION 'Challan already fully paid'; END IF;
  applied := least(t.amount, outstanding);
  IF applied <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  st := CASE WHEN t.amount > outstanding THEN 'overpaid' WHEN applied < outstanding THEN 'partial' ELSE 'matched' END;
  UPDATE public.fee_challans SET paid_amount = paid_amount + applied,
    paid_on = CASE WHEN applied >= outstanding THEN t.txn_date ELSE paid_on END WHERE id = c.id;
  UPDATE public.bank_transactions SET matched_challan_id = c.id, matched_at = now(),
    matched_by = auth.uid(), match_status = st, applied_amount = applied,
    match_note = coalesce(_note, CASE WHEN st='overpaid' THEN 'Paid '||t.amount||' against '||outstanding||' outstanding — refund/advance review' END)
  WHERE id = t.id;
  INSERT INTO public.fee_ledger (tenant_id, campus_id, challan_id, entry_type, amount, bank_transaction_id, notes, created_by)
  VALUES (c.tenant_id, c.campus_id, c.id, CASE WHEN t.source='webhook' THEN 'bank_webhook' ELSE 'bank_match' END,
          applied, t.id, 'Bank '||t.source||' '||coalesce(t.reference, t.id::text), auth.uid());
  RETURN jsonb_build_object('status',st,'challan_id',c.id,'challan_no',c.challan_no,'applied',applied,'student_id',c.student_id);
END $$;

-- Auto-match unmatched transactions by finding a challan number in reference/description.
CREATE OR REPLACE FUNCTION public.auto_reconcile_bank_transactions(_batch text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; hits uuid[]; ch public.fee_challans; res jsonb;
  n_matched int := 0; n_partial int := 0; n_review int := 0; n_unknown int := 0; n_dup int := 0;
BEGIN
  FOR t IN SELECT * FROM public.bank_transactions bt
    WHERE bt.matched_challan_id IS NULL AND bt.match_status IN ('unmatched','unknown','ambiguous')
      AND (_batch IS NULL OR bt.import_batch = _batch)
      AND (coalesce(auth.role(),'')='service_role' OR public.can_manage_fees(auth.uid(), bt.campus_id))
  LOOP
    SELECT array_agg(fc.id) INTO hits FROM public.fee_challans fc
      WHERE fc.campus_id = t.campus_id AND length(fc.challan_no) >= 4
        AND position(upper(fc.challan_no) in upper(coalesce(t.reference,'')||' '||coalesce(t.description,''))) > 0;
    IF hits IS NULL OR array_length(hits,1) = 0 THEN
      UPDATE public.bank_transactions SET match_status='unknown', match_note='No challan number found in reference/description' WHERE id=t.id;
      n_unknown := n_unknown + 1; CONTINUE;
    END IF;
    IF array_length(hits,1) > 1 THEN
      UPDATE public.bank_transactions SET match_status='ambiguous', match_note='Multiple challan numbers found — match manually' WHERE id=t.id;
      n_review := n_review + 1; CONTINUE;
    END IF;
    SELECT * INTO ch FROM public.fee_challans WHERE id = hits[1];
    IF ch.status = 'waived' OR ch.paid_amount >= greatest(ch.gross_amount - ch.discount_amount + ch.fine_amount,0) THEN
      IF EXISTS (SELECT 1 FROM public.bank_transactions o WHERE o.matched_challan_id = ch.id AND o.id <> t.id AND o.amount = t.amount) THEN
        UPDATE public.bank_transactions SET match_status='duplicate', match_note='Already credited to '||ch.challan_no||' (e.g. via instant bank alert) — not counted again' WHERE id=t.id;
        n_dup := n_dup + 1;
      ELSE
        UPDATE public.bank_transactions SET match_status='review', match_note='Challan '||ch.challan_no||' already settled — possible double payment' WHERE id=t.id;
        n_review := n_review + 1;
      END IF;
      CONTINUE;
    END IF;
    res := public.apply_bank_payment(t.id, ch.id, NULL);
    IF res->>'status' = 'partial' THEN n_partial := n_partial + 1;
    ELSIF res->>'status' = 'overpaid' THEN n_review := n_review + 1;
    ELSE n_matched := n_matched + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('matched',n_matched,'partial',n_partial,'review',n_review,'unknown',n_unknown,'duplicate',n_dup);
END $$;

REVOKE ALL ON FUNCTION public.apply_bank_payment(uuid,uuid,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.auto_reconcile_bank_transactions(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_bank_payment(uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auto_reconcile_bank_transactions(text) TO authenticated, service_role;