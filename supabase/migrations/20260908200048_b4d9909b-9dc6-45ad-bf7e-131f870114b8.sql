DROP POLICY IF EXISTS "bank_accounts_read" ON public.bank_accounts;
CREATE POLICY "bank_accounts_read" ON public.bank_accounts FOR SELECT TO authenticated
USING (get_user_tenant(auth.uid()) = tenant_id AND public.can_manage_fees(auth.uid(), campus_id));

DROP POLICY IF EXISTS "challans_staff_read" ON public.fee_challans;
CREATE POLICY "challans_staff_read" ON public.fee_challans FOR SELECT TO authenticated
USING (get_user_tenant(auth.uid()) = tenant_id AND public.can_manage_fees(auth.uid(), campus_id));

DROP POLICY IF EXISTS "ledger_staff_read" ON public.fee_ledger;
CREATE POLICY "ledger_staff_read" ON public.fee_ledger FOR SELECT TO authenticated
USING (get_user_tenant(auth.uid()) = tenant_id AND public.can_manage_fees(auth.uid(), campus_id));

DROP POLICY IF EXISTS "bank_txn_read" ON public.bank_transactions;
CREATE POLICY "bank_txn_read" ON public.bank_transactions FOR SELECT TO authenticated
USING (get_user_tenant(auth.uid()) = tenant_id AND public.can_manage_fees(auth.uid(), campus_id));

DROP POLICY IF EXISTS "scholarships_staff_read" ON public.scholarships;
CREATE POLICY "scholarships_staff_read" ON public.scholarships FOR SELECT TO authenticated
USING (get_user_tenant(auth.uid()) = tenant_id AND public.can_manage_fees(auth.uid(), campus_id));

DROP POLICY IF EXISTS "Public read branding" ON storage.objects;
CREATE POLICY "Public read branding logos" ON storage.objects FOR SELECT TO anon, authenticated
USING (
  bucket_id = 'branding'
  AND (
    name ILIKE '%logo%' OR name ILIKE '%favicon%' OR name ILIKE '%icon%'
    OR is_platform_owner(auth.uid())
    OR (auth.uid() IS NOT NULL AND (get_user_tenant(auth.uid()))::text = (storage.foldername(name))[1])
  )
);