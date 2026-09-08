-- Remove direct anonymous privileges from sensitive tenant data.
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.board_registrations FROM anon;
REVOKE ALL ON TABLE public.board_exam_entries FROM anon;
REVOKE ALL ON TABLE public.board_results FROM anon;
REVOKE ALL ON TABLE public.cambridge_registrations FROM anon;
REVOKE ALL ON TABLE public.cambridge_subject_entries FROM anon;
REVOKE ALL ON TABLE public.cambridge_results FROM anon;
REVOKE ALL ON TABLE public.track_switches FROM anon;

GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.board_registrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.board_exam_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.board_results TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cambridge_registrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cambridge_subject_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cambridge_results TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.track_switches TO authenticated;
GRANT ALL ON TABLE public.profiles, public.board_registrations, public.board_exam_entries,
  public.board_results, public.cambridge_registrations, public.cambridge_subject_entries,
  public.cambridge_results, public.track_switches TO service_role;

-- Profile identity placement must never be self-service mutable.
CREATE OR REPLACE FUNCTION public.protect_profile_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.id = auth.uid()
     AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
          OR NEW.campus_id IS DISTINCT FROM OLD.campus_id)
     AND NOT (
       public.is_super_admin(auth.uid())
       AND public.get_user_tenant(auth.uid()) = OLD.tenant_id
     ) THEN
    RAISE EXCEPTION 'Institution and campus assignment cannot be changed from your own profile';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_profile_scope() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_profile_scope() TO service_role;
DROP TRIGGER IF EXISTS protect_profile_scope_trigger ON public.profiles;
CREATE TRIGGER protect_profile_scope_trigger
BEFORE UPDATE OF tenant_id, campus_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_scope();

DROP POLICY IF EXISTS profiles_insert_self ON public.profiles;
CREATE POLICY profiles_insert_self ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (
  (
    id = auth.uid()
    AND tenant_id = public.get_user_tenant(auth.uid())
    AND (campus_id IS NULL OR campus_id = public.get_user_campus(auth.uid()))
  )
  OR (
    public.get_user_tenant(auth.uid()) = tenant_id
    AND public.is_super_admin(auth.uid())
  )
);

DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
FOR UPDATE TO authenticated
USING (
  id = auth.uid()
  OR (
    public.get_user_tenant(auth.uid()) = tenant_id
    AND (
      public.is_super_admin(auth.uid())
      OR (
        public.has_role(auth.uid(), 'campus_admin'::public.app_role)
        AND campus_id = public.get_user_campus(auth.uid())
      )
    )
  )
)
WITH CHECK (
  (
    id = auth.uid()
    AND tenant_id = public.get_user_tenant(auth.uid())
    AND (campus_id IS NULL OR campus_id = public.get_user_campus(auth.uid()))
  )
  OR (
    public.get_user_tenant(auth.uid()) = tenant_id
    AND (
      public.is_super_admin(auth.uid())
      OR (
        public.has_role(auth.uid(), 'campus_admin'::public.app_role)
        AND campus_id = public.get_user_campus(auth.uid())
      )
    )
  )
);

-- Replace broad academic-record policies with operation-specific rules.
DROP POLICY IF EXISTS "board_reg campus access" ON public.board_registrations;
DROP POLICY IF EXISTS "board_entries via reg" ON public.board_exam_entries;
DROP POLICY IF EXISTS "board_results via reg" ON public.board_results;
DROP POLICY IF EXISTS "cam_reg campus access" ON public.cambridge_registrations;
DROP POLICY IF EXISTS "cam_entry campus access" ON public.cambridge_subject_entries;
DROP POLICY IF EXISTS "cam_res campus access" ON public.cambridge_results;
DROP POLICY IF EXISTS "track_switch campus access" ON public.track_switches;

CREATE POLICY board_reg_read ON public.board_registrations FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant(auth.uid()) AND (public.has_campus_access(auth.uid(), campus_id) OR public.is_student_owner(auth.uid(), student_id)));
CREATE POLICY board_reg_insert ON public.board_registrations FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_campus_access(auth.uid(), campus_id) AND public.tenant_is_writable(tenant_id));
CREATE POLICY board_reg_update ON public.board_registrations FOR UPDATE TO authenticated
USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_campus_access(auth.uid(), campus_id))
WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_campus_access(auth.uid(), campus_id) AND public.tenant_is_writable(tenant_id));
CREATE POLICY board_reg_delete ON public.board_registrations FOR DELETE TO authenticated
USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_campus_access(auth.uid(), campus_id) AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'campus_admin'::public.app_role)));

CREATE POLICY board_entry_read ON public.board_exam_entries FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.board_registrations r WHERE r.id=board_exam_entries.registration_id AND r.tenant_id=board_exam_entries.tenant_id AND (public.has_campus_access(auth.uid(),r.campus_id) OR public.is_student_owner(auth.uid(),r.student_id))));
CREATE POLICY board_entry_insert ON public.board_exam_entries FOR INSERT TO authenticated
WITH CHECK (board_exam_entries.tenant_id=public.get_user_tenant(auth.uid()) AND public.tenant_is_writable(board_exam_entries.tenant_id) AND EXISTS (SELECT 1 FROM public.board_registrations r WHERE r.id=board_exam_entries.registration_id AND r.tenant_id=board_exam_entries.tenant_id AND public.has_campus_access(auth.uid(),r.campus_id)));
CREATE POLICY board_entry_update ON public.board_exam_entries FOR UPDATE TO authenticated
USING (board_exam_entries.tenant_id=public.get_user_tenant(auth.uid()) AND EXISTS (SELECT 1 FROM public.board_registrations r WHERE r.id=board_exam_entries.registration_id AND r.tenant_id=board_exam_entries.tenant_id AND public.has_campus_access(auth.uid(),r.campus_id)))
WITH CHECK (board_exam_entries.tenant_id=public.get_user_tenant(auth.uid()) AND public.tenant_is_writable(board_exam_entries.tenant_id) AND EXISTS (SELECT 1 FROM public.board_registrations r WHERE r.id=board_exam_entries.registration_id AND r.tenant_id=board_exam_entries.tenant_id AND public.has_campus_access(auth.uid(),r.campus_id)));
CREATE POLICY board_entry_delete ON public.board_exam_entries FOR DELETE TO authenticated
USING (board_exam_entries.tenant_id=public.get_user_tenant(auth.uid()) AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'campus_admin'::public.app_role)) AND EXISTS (SELECT 1 FROM public.board_registrations r WHERE r.id=board_exam_entries.registration_id AND r.tenant_id=board_exam_entries.tenant_id AND public.has_campus_access(auth.uid(),r.campus_id)));

CREATE POLICY board_result_read ON public.board_results FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.board_exam_entries e JOIN public.board_registrations r ON r.id=e.registration_id WHERE e.id=board_results.entry_id AND e.tenant_id=board_results.tenant_id AND r.tenant_id=board_results.tenant_id AND (public.has_campus_access(auth.uid(),r.campus_id) OR public.is_student_owner(auth.uid(),r.student_id))));
CREATE POLICY board_result_insert ON public.board_results FOR INSERT TO authenticated
WITH CHECK (board_results.tenant_id=public.get_user_tenant(auth.uid()) AND public.tenant_is_writable(board_results.tenant_id) AND EXISTS (SELECT 1 FROM public.board_exam_entries e JOIN public.board_registrations r ON r.id=e.registration_id WHERE e.id=board_results.entry_id AND e.tenant_id=board_results.tenant_id AND r.tenant_id=board_results.tenant_id AND public.has_campus_access(auth.uid(),r.campus_id)));
CREATE POLICY board_result_update ON public.board_results FOR UPDATE TO authenticated
USING (board_results.tenant_id=public.get_user_tenant(auth.uid()) AND EXISTS (SELECT 1 FROM public.board_exam_entries e JOIN public.board_registrations r ON r.id=e.registration_id WHERE e.id=board_results.entry_id AND e.tenant_id=board_results.tenant_id AND r.tenant_id=board_results.tenant_id AND public.has_campus_access(auth.uid(),r.campus_id)))
WITH CHECK (board_results.tenant_id=public.get_user_tenant(auth.uid()) AND public.tenant_is_writable(board_results.tenant_id) AND EXISTS (SELECT 1 FROM public.board_exam_entries e JOIN public.board_registrations r ON r.id=e.registration_id WHERE e.id=board_results.entry_id AND e.tenant_id=board_results.tenant_id AND r.tenant_id=board_results.tenant_id AND public.has_campus_access(auth.uid(),r.campus_id)));
CREATE POLICY board_result_delete ON public.board_results FOR DELETE TO authenticated
USING (board_results.tenant_id=public.get_user_tenant(auth.uid()) AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'campus_admin'::public.app_role)) AND EXISTS (SELECT 1 FROM public.board_exam_entries e JOIN public.board_registrations r ON r.id=e.registration_id WHERE e.id=board_results.entry_id AND e.tenant_id=board_results.tenant_id AND r.tenant_id=board_results.tenant_id AND public.has_campus_access(auth.uid(),r.campus_id)));

CREATE POLICY cam_reg_read ON public.cambridge_registrations FOR SELECT TO authenticated
USING (tenant_id=public.get_user_tenant(auth.uid()) AND (public.has_campus_access(auth.uid(),campus_id) OR public.is_student_owner(auth.uid(),student_id)));
CREATE POLICY cam_reg_insert ON public.cambridge_registrations FOR INSERT TO authenticated
WITH CHECK (tenant_id=public.get_user_tenant(auth.uid()) AND public.has_campus_access(auth.uid(),campus_id) AND public.tenant_is_writable(tenant_id));
CREATE POLICY cam_reg_update ON public.cambridge_registrations FOR UPDATE TO authenticated
USING (tenant_id=public.get_user_tenant(auth.uid()) AND public.has_campus_access(auth.uid(),campus_id))
WITH CHECK (tenant_id=public.get_user_tenant(auth.uid()) AND public.has_campus_access(auth.uid(),campus_id) AND public.tenant_is_writable(tenant_id));
CREATE POLICY cam_reg_delete ON public.cambridge_registrations FOR DELETE TO authenticated
USING (tenant_id=public.get_user_tenant(auth.uid()) AND public.has_campus_access(auth.uid(),campus_id) AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'campus_admin'::public.app_role)));

CREATE POLICY cam_entry_read ON public.cambridge_subject_entries FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.cambridge_registrations r WHERE r.id=cambridge_subject_entries.registration_id AND r.tenant_id=cambridge_subject_entries.tenant_id AND (public.has_campus_access(auth.uid(),r.campus_id) OR public.is_student_owner(auth.uid(),r.student_id))));
CREATE POLICY cam_entry_insert ON public.cambridge_subject_entries FOR INSERT TO authenticated
WITH CHECK (cambridge_subject_entries.tenant_id=public.get_user_tenant(auth.uid()) AND public.tenant_is_writable(cambridge_subject_entries.tenant_id) AND EXISTS (SELECT 1 FROM public.cambridge_registrations r WHERE r.id=cambridge_subject_entries.registration_id AND r.tenant_id=cambridge_subject_entries.tenant_id AND public.has_campus_access(auth.uid(),r.campus_id)));
CREATE POLICY cam_entry_update ON public.cambridge_subject_entries FOR UPDATE TO authenticated
USING (cambridge_subject_entries.tenant_id=public.get_user_tenant(auth.uid()) AND EXISTS (SELECT 1 FROM public.cambridge_registrations r WHERE r.id=cambridge_subject_entries.registration_id AND r.tenant_id=cambridge_subject_entries.tenant_id AND public.has_campus_access(auth.uid(),r.campus_id)))
WITH CHECK (cambridge_subject_entries.tenant_id=public.get_user_tenant(auth.uid()) AND public.tenant_is_writable(cambridge_subject_entries.tenant_id) AND EXISTS (SELECT 1 FROM public.cambridge_registrations r WHERE r.id=cambridge_subject_entries.registration_id AND r.tenant_id=cambridge_subject_entries.tenant_id AND public.has_campus_access(auth.uid(),r.campus_id)));
CREATE POLICY cam_entry_delete ON public.cambridge_subject_entries FOR DELETE TO authenticated
USING (cambridge_subject_entries.tenant_id=public.get_user_tenant(auth.uid()) AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'campus_admin'::public.app_role)) AND EXISTS (SELECT 1 FROM public.cambridge_registrations r WHERE r.id=cambridge_subject_entries.registration_id AND r.tenant_id=cambridge_subject_entries.tenant_id AND public.has_campus_access(auth.uid(),r.campus_id)));

CREATE POLICY cam_result_read ON public.cambridge_results FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.cambridge_subject_entries e JOIN public.cambridge_registrations r ON r.id=e.registration_id WHERE e.id=cambridge_results.entry_id AND e.tenant_id=cambridge_results.tenant_id AND r.tenant_id=cambridge_results.tenant_id AND (public.has_campus_access(auth.uid(),r.campus_id) OR public.is_student_owner(auth.uid(),r.student_id))));
CREATE POLICY cam_result_insert ON public.cambridge_results FOR INSERT TO authenticated
WITH CHECK (cambridge_results.tenant_id=public.get_user_tenant(auth.uid()) AND public.tenant_is_writable(cambridge_results.tenant_id) AND EXISTS (SELECT 1 FROM public.cambridge_subject_entries e JOIN public.cambridge_registrations r ON r.id=e.registration_id WHERE e.id=cambridge_results.entry_id AND e.tenant_id=cambridge_results.tenant_id AND r.tenant_id=cambridge_results.tenant_id AND public.has_campus_access(auth.uid(),r.campus_id)));
CREATE POLICY cam_result_update ON public.cambridge_results FOR UPDATE TO authenticated
USING (cambridge_results.tenant_id=public.get_user_tenant(auth.uid()) AND EXISTS (SELECT 1 FROM public.cambridge_subject_entries e JOIN public.cambridge_registrations r ON r.id=e.registration_id WHERE e.id=cambridge_results.entry_id AND e.tenant_id=cambridge_results.tenant_id AND r.tenant_id=cambridge_results.tenant_id AND public.has_campus_access(auth.uid(),r.campus_id)))
WITH CHECK (cambridge_results.tenant_id=public.get_user_tenant(auth.uid()) AND public.tenant_is_writable(cambridge_results.tenant_id) AND EXISTS (SELECT 1 FROM public.cambridge_subject_entries e JOIN public.cambridge_registrations r ON r.id=e.registration_id WHERE e.id=cambridge_results.entry_id AND e.tenant_id=cambridge_results.tenant_id AND r.tenant_id=cambridge_results.tenant_id AND public.has_campus_access(auth.uid(),r.campus_id)));
CREATE POLICY cam_result_delete ON public.cambridge_results FOR DELETE TO authenticated
USING (cambridge_results.tenant_id=public.get_user_tenant(auth.uid()) AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'campus_admin'::public.app_role)) AND EXISTS (SELECT 1 FROM public.cambridge_subject_entries e JOIN public.cambridge_registrations r ON r.id=e.registration_id WHERE e.id=cambridge_results.entry_id AND e.tenant_id=cambridge_results.tenant_id AND r.tenant_id=cambridge_results.tenant_id AND public.has_campus_access(auth.uid(),r.campus_id)));

CREATE POLICY track_switch_read ON public.track_switches FOR SELECT TO authenticated
USING (tenant_id=public.get_user_tenant(auth.uid()) AND (public.has_campus_access(auth.uid(),campus_id) OR public.is_student_owner(auth.uid(),student_id)));
CREATE POLICY track_switch_insert ON public.track_switches FOR INSERT TO authenticated
WITH CHECK (tenant_id=public.get_user_tenant(auth.uid()) AND public.has_campus_access(auth.uid(),campus_id) AND public.tenant_is_writable(tenant_id));
CREATE POLICY track_switch_update ON public.track_switches FOR UPDATE TO authenticated
USING (tenant_id=public.get_user_tenant(auth.uid()) AND public.has_campus_access(auth.uid(),campus_id))
WITH CHECK (tenant_id=public.get_user_tenant(auth.uid()) AND public.has_campus_access(auth.uid(),campus_id) AND public.tenant_is_writable(tenant_id));
CREATE POLICY track_switch_delete ON public.track_switches FOR DELETE TO authenticated
USING (tenant_id=public.get_user_tenant(auth.uid()) AND public.has_campus_access(auth.uid(),campus_id) AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'campus_admin'::public.app_role)));

-- Signed-in users only see public plans or their own current plan; the platform owner sees all.
DROP POLICY IF EXISTS plan_tiers_all_rows_readable_authenticated ON public.plan_tiers;
DROP POLICY IF EXISTS plan_tiers_authenticated_read ON public.plan_tiers;
CREATE POLICY plan_tiers_authenticated_read ON public.plan_tiers FOR SELECT TO authenticated
USING (
  is_public
  OR public.is_platform_owner(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id=public.get_user_tenant(auth.uid()) AND t.plan_tier_id=plan_tiers.id
  )
);

-- Correct grouped status totals and keep all reporting exact in the database.
CREATE OR REPLACE FUNCTION public.ai_reporting_summary(_feature text, _campus uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tenant uuid := public.get_user_tenant(auth.uid());
  _result jsonb;
BEGIN
  IF auth.uid() IS NULL OR _tenant IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF _campus IS NOT NULL AND NOT public.has_campus_access(auth.uid(),_campus) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _feature='attendance' THEN
    SELECT jsonb_build_object('total',count(*),'present',count(*) FILTER (WHERE status='present'),'absent',count(*) FILTER (WHERE status='absent'),'late',count(*) FILTER (WHERE status='late'),'leave',count(*) FILTER (WHERE status='leave')) INTO _result FROM public.attendance_records WHERE tenant_id=_tenant AND (_campus IS NULL OR campus_id=_campus);
  ELSIF _feature='admissions' THEN
    SELECT jsonb_build_object('total',count(*),'new',count(*) FILTER (WHERE status='new'),'contacted',count(*) FILTER (WHERE status='contacted'),'visited',count(*) FILTER (WHERE status='visited'),'converted',count(*) FILTER (WHERE status='converted'),'lost',count(*) FILTER (WHERE status='lost')) INTO _result FROM public.inquiries WHERE tenant_id=_tenant AND (_campus IS NULL OR campus_id=_campus);
  ELSIF _feature='results' THEN
    SELECT jsonb_build_object('report_cards',count(*),'published',count(*) FILTER (WHERE status='published'),'draft',count(*) FILTER (WHERE status='draft'),'locked',count(*) FILTER (WHERE status='locked'),'average_percent',round(coalesce(avg(overall_percent),0),2)) INTO _result FROM public.report_cards WHERE tenant_id=_tenant AND (_campus IS NULL OR campus_id=_campus);
  ELSE RAISE EXCEPTION 'Unsupported reporting feature'; END IF;
  RETURN coalesce(_result,'{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.ai_reporting_summary(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_reporting_summary(text,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fee_totals_monthly(_campus uuid DEFAULT NULL, _months integer DEFAULT 6)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tenant uuid := public.get_user_tenant(auth.uid());
  _result jsonb;
BEGIN
  IF auth.uid() IS NULL OR _tenant IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF _months < 1 OR _months > 36 THEN RAISE EXCEPTION 'Months must be between 1 and 36'; END IF;
  IF _campus IS NOT NULL AND NOT public.has_campus_access(auth.uid(),_campus) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('month',to_char(m.month_start,'YYYY-MM'),'billed',coalesce(x.billed,0),'collected',coalesce(x.collected,0),'outstanding',coalesce(x.outstanding,0),'overdue',coalesce(x.overdue,0)) ORDER BY m.month_start),'[]'::jsonb)
  INTO _result
  FROM generate_series(date_trunc('month',current_date)-((_months-1)||' months')::interval,date_trunc('month',current_date),'1 month') m(month_start)
  LEFT JOIN LATERAL (
    SELECT sum(gross_amount+fine_amount-discount_amount) billed,
      sum(paid_amount) collected,
      sum(greatest(gross_amount+fine_amount-discount_amount-paid_amount,0)) outstanding,
      count(*) FILTER (WHERE due_date<current_date AND status<>'waived' AND gross_amount+fine_amount-discount_amount-paid_amount>0) overdue
    FROM public.fee_challans f
    WHERE f.tenant_id=_tenant AND (_campus IS NULL OR f.campus_id=_campus)
      AND f.issue_date>=m.month_start::date AND f.issue_date<(m.month_start+interval '1 month')::date
  ) x ON true;
  RETURN _result;
END;
$$;
REVOKE ALL ON FUNCTION public.fee_totals_monthly(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fee_totals_monthly(uuid,integer) TO authenticated, service_role;