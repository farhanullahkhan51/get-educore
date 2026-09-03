DROP POLICY IF EXISTS audit_logs_insert_authenticated ON public.audit_logs;

CREATE POLICY "audit_logs_insert_service_role"
  ON public.audit_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

GRANT ALL ON public.audit_logs TO service_role;