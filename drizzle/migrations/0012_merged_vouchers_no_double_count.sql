CREATE OR REPLACE FUNCTION public.roll_challans_into(_target uuid, _ids uuid[])
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t record; _c record; _total numeric := 0; _lines jsonb := '[]'::jsonb; _bal numeric;
BEGIN
  SELECT * INTO _t FROM fee_challans WHERE id = _target FOR UPDATE;
  IF _t.id IS NULL THEN RAISE EXCEPTION 'Voucher not found'; END IF;
  IF NOT can_manage_fees(auth.uid(), _t.campus_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  FOR _c IN SELECT * FROM fee_challans
     WHERE id = ANY(_ids) AND id <> _target AND student_id = _t.student_id
       AND merged_into IS NULL AND status IN ('unpaid','partial','overdue')
     ORDER BY due_date FOR UPDATE LOOP
    _bal := greatest(_c.gross_amount - _c.discount_amount + _c.fine_amount - _c.paid_amount, 0);
    IF _bal <= 0 THEN CONTINUE; END IF;
    _total := _total + _bal;
    _lines := _lines || jsonb_build_object('label', 'Arrears ' || coalesce(_c.period_label, _c.challan_no),
      'amount', _bal, 'ref', _c.challan_no);
    UPDATE fee_challans SET merged_into = _target, status = 'waived',
      gross_amount = gross_amount - _bal,
      notes = trim(coalesce(notes,'') || ' Unpaid ' || _bal::text || ' moved to ' || _t.challan_no) WHERE id = _c.id;
  END LOOP;
  IF _total > 0 THEN
    UPDATE fee_challans SET gross_amount = gross_amount + _total, line_items = coalesce(line_items,'[]'::jsonb) || _lines
     WHERE id = _target;
  END IF;
  RETURN _total;
END $$;