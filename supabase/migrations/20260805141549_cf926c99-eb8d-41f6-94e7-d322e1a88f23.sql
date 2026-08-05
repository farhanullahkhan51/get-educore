ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS academic_system public.academic_system NOT NULL DEFAULT 'both';

UPDATE public.sections s
SET class_teacher_id = NULL
WHERE class_teacher_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.sections o
    WHERE o.class_teacher_id = s.class_teacher_id
      AND (o.created_at, o.id) < (s.created_at, s.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS sections_class_teacher_unique
  ON public.sections (class_teacher_id)
  WHERE class_teacher_id IS NOT NULL;