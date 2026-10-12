DROP INDEX IF EXISTS public.bank_transactions_external_uidx;
CREATE UNIQUE INDEX bank_transactions_external_uidx ON public.bank_transactions (tenant_id, external_txn_id);