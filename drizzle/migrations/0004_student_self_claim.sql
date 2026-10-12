CREATE TABLE public.portal_claim_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.portal_claim_attempts TO service_role;
ALTER TABLE public.portal_claim_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.portal_claim_attempts (user_id, created_at);

CREATE OR REPLACE FUNCTION public.protect_profile_scope()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF coalesce(current_setting('educore.portal_claim', true), '') = '1' THEN
    RETURN NEW;
  END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.claim_student_account(_code text, _phone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _p text := regexp_replace(coalesce(_phone,''), '\D', '', 'g');
  _s record;
  _tenant uuid;
  _fails int;
  _other_roles int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  _p := CASE WHEN length(_p) > 10 THEN right(_p, 10) ELSE ltrim(_p, '0') END;

  SELECT count(*) INTO _fails FROM portal_claim_attempts
   WHERE user_id = _uid AND NOT success AND created_at > now() - interval '1 hour';
  IF _fails >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Too many attempts. Please try again in an hour or contact the school office.');
  END IF;

  IF EXISTS (SELECT 1 FROM students WHERE profile_id = _uid) THEN
    RETURN jsonb_build_object('ok', true, 'message', 'Your portal is already active.');
  END IF;

  SELECT count(*) INTO _other_roles FROM user_roles WHERE user_id = _uid AND role <> 'student';
  IF _other_roles > 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Staff accounts cannot be linked to a student. Register with a separate email.');
  END IF;

  SELECT s.id, s.campus_id, s.profile_id, s.guardian_phone INTO _s
    FROM students s WHERE upper(trim(s.student_code)) = upper(trim(coalesce(_code,''))) LIMIT 1;

  IF _s.id IS NULL OR length(_p) < 9 OR _s.profile_id IS NOT NULL
     OR (CASE WHEN length(regexp_replace(coalesce(_s.guardian_phone,''),'\D','','g')) > 10
              THEN right(regexp_replace(_s.guardian_phone,'\D','','g'),10)
              ELSE ltrim(regexp_replace(coalesce(_s.guardian_phone,''),'\D','','g'),'0') END) <> _p THEN
    INSERT INTO portal_claim_attempts(user_id, success) VALUES (_uid, false);
    RETURN jsonb_build_object('ok', false, 'message', 'The student code and guardian phone do not match our records, or this student is already registered. Contact the school office.');
  END IF;

  SELECT tenant_id INTO _tenant FROM campuses WHERE id = _s.campus_id;

  PERFORM set_config('educore.portal_claim', '1', true);
  UPDATE profiles SET tenant_id = _tenant, campus_id = _s.campus_id WHERE id = _uid;
  PERFORM set_config('educore.portal_claim', '', true);
  UPDATE students SET profile_id = _uid WHERE id = _s.id AND profile_id IS NULL;
  INSERT INTO user_roles(user_id, role, campus_id, tenant_id)
    SELECT _uid, 'student', _s.campus_id, _tenant
    WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = _uid AND role = 'student');
  INSERT INTO portal_claim_attempts(user_id, success) VALUES (_uid, true);
  RETURN jsonb_build_object('ok', true, 'message', 'Portal activated.');
END;
$$;
REVOKE ALL ON FUNCTION public.claim_student_account(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_student_account(text, text) TO authenticated;