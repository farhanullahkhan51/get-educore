CREATE TABLE public.notices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  campus_id UUID REFERENCES public.campuses(id) ON DELETE CASCADE,
  reference_no TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  priority TEXT NOT NULL DEFAULT 'normal',
  audience TEXT NOT NULL DEFAULT 'all',
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  issued_by TEXT NOT NULL DEFAULT 'Office of the Principal',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notices_category_check CHECK (category IN ('general','academic','administrative','holiday','examination','fees')),
  CONSTRAINT notices_priority_check CHECK (priority IN ('normal','urgent','critical')),
  CONSTRAINT notices_audience_check CHECK (audience IN ('all','staff','students'))
);

CREATE INDEX notices_tenant_idx ON public.notices (tenant_id, published_at DESC);
CREATE INDEX notices_campus_idx ON public.notices (campus_id);
CREATE UNIQUE INDEX notices_tenant_ref_idx ON public.notices (tenant_id, reference_no);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notices TO authenticated;
GRANT ALL ON public.notices TO service_role;

ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notices_select_scoped" ON public.notices
FOR SELECT TO authenticated
USING (
  get_user_tenant(auth.uid()) = tenant_id
  AND (
    is_super_admin(auth.uid())
    OR has_role(auth.uid(), 'campus_admin'::app_role)
    OR (
      is_published
      AND (expires_at IS NULL OR expires_at > now())
      AND (campus_id IS NULL OR campus_id = get_user_campus(auth.uid()))
      AND (
        audience = 'all'
        OR (audience = 'students' AND has_role(auth.uid(), 'student'::app_role))
        OR (audience = 'staff' AND NOT has_role(auth.uid(), 'student'::app_role))
      )
    )
  )
);

CREATE POLICY "notices_manage_admin" ON public.notices
FOR ALL TO authenticated
USING (
  get_user_tenant(auth.uid()) = tenant_id
  AND tenant_is_writable(tenant_id)
  AND (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'campus_admin'::app_role)
        AND (campus_id IS NULL OR campus_id = get_user_campus(auth.uid())))
  )
)
WITH CHECK (
  get_user_tenant(auth.uid()) = tenant_id
  AND tenant_is_writable(tenant_id)
  AND (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'campus_admin'::app_role)
        AND (campus_id IS NULL OR campus_id = get_user_campus(auth.uid())))
  )
);

CREATE TRIGGER update_notices_updated_at
BEFORE UPDATE ON public.notices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();