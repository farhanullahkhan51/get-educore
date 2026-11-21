CREATE OR REPLACE FUNCTION public.apply_late_fines(_campus uuid, _mode text, _value numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_fees(auth.uid(), _campus) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF _mode NOT IN ('flat','percent') OR _value IS NULL OR _value <= 0 OR (_mode = 'percent' AND _value > 100) THEN
    RAISE EXCEPTION 'Invalid fine rule';
  END IF;
  UPDATE public.fee_challans c
     SET fine_amount = CASE WHEN _mode = 'flat' THEN round(_value)
                            ELSE round((c.gross_amount - c.discount_amount) * _value / 100) END,
         status = 'overdue'
   WHERE c.campus_id = _campus
     AND c.status IN ('unpaid','partial','overdue')
     AND c.due_date < current_date
     AND coalesce(c.fine_amount,0) = 0;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('updated', n);
END $$;
REVOKE ALL ON FUNCTION public.apply_late_fines(uuid,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_late_fines(uuid,text,numeric) TO authenticated;