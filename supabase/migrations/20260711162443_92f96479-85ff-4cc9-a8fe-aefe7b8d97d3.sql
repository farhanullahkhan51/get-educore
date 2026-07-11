
-- student-docs: staff can manage; students can read files under {profile_id}/
CREATE POLICY "student_docs_staff_all" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'student-docs' AND (
      public.is_super_admin(auth.uid())
      OR public.has_role(auth.uid(), 'campus_admin')
      OR public.has_role(auth.uid(), 'admissions_officer')
    )
  )
  WITH CHECK (
    bucket_id = 'student-docs' AND (
      public.is_super_admin(auth.uid())
      OR public.has_role(auth.uid(), 'campus_admin')
      OR public.has_role(auth.uid(), 'admissions_officer')
    )
  );

CREATE POLICY "student_docs_owner_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'student-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "staff_docs_staff_all" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'staff-docs' AND (
      public.is_super_admin(auth.uid())
      OR public.has_role(auth.uid(), 'campus_admin')
    )
  )
  WITH CHECK (
    bucket_id = 'staff-docs' AND (
      public.is_super_admin(auth.uid())
      OR public.has_role(auth.uid(), 'campus_admin')
    )
  );

CREATE POLICY "staff_docs_owner_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'staff-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
