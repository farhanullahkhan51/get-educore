DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bank_accounts','bank_transactions','fee_structures','fee_ledger','scholarships',
    'staff_payroll','board_registrations','board_exam_entries','board_results',
    'cambridge_registrations','cambridge_subject_entries','cambridge_results',
    'course_assignments','grading_scales','section_seats','track_switches','ai_threads'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_writable ON public.%I', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_writable_del ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_writable BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable()', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_writable_del BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable()', t, t);
  END LOOP;
END $$;
