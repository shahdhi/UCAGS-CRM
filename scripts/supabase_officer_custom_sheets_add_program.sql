-- Migration: Add program_name and program_id to officer_custom_sheets
-- So officer sheets track which program they belong to (same as crm_leads)

ALTER TABLE public.officer_custom_sheets
  ADD COLUMN IF NOT EXISTS program_id   uuid,
  ADD COLUMN IF NOT EXISTS program_name text;

CREATE INDEX IF NOT EXISTS idx_officer_custom_sheets_program
  ON public.officer_custom_sheets (program_id);

COMMENT ON COLUMN public.officer_custom_sheets.program_id   IS 'UUID of the program this batch belongs to';
COMMENT ON COLUMN public.officer_custom_sheets.program_name IS 'Display name of the program (e.g. "Data Science")';

-- Backfill existing rows from program_batches where batch_name matches
UPDATE public.officer_custom_sheets ocs
SET
  program_id   = pb.program_id,
  program_name = p.name
FROM public.program_batches pb
JOIN public.programs p ON p.id = pb.program_id
WHERE ocs.batch_name = pb.batch_name
  AND ocs.program_id IS NULL;
