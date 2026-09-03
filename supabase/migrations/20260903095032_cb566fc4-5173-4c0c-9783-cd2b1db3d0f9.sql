DROP POLICY IF EXISTS "Platform owners manage AI limits" ON public.ai_usage_limits;

CREATE POLICY "Platform owner manages AI limits"
ON public.ai_usage_limits FOR ALL TO authenticated
USING (public.is_platform_owner(auth.uid()))
WITH CHECK (public.is_platform_owner(auth.uid()));