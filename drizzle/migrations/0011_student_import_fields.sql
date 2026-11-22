ALTER TABLE public.students ADD COLUMN IF NOT EXISTS father_cnic text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS phone_home text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS monthly_fee numeric;