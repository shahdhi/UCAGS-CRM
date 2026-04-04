-- ============================================================
-- XP Archive System — Batch Transition Reset
-- Run in Supabase SQL editor
-- ============================================================

-- 1) Add program context to existing XP events (nullable, backward-compatible)
ALTER TABLE public.officer_xp_events
  ADD COLUMN IF NOT EXISTS program_id uuid,
  ADD COLUMN IF NOT EXISTS batch_name text;

CREATE INDEX IF NOT EXISTS idx_xp_events_program_batch
  ON public.officer_xp_events (program_id, batch_name);

CREATE INDEX IF NOT EXISTS idx_xp_events_batch_name
  ON public.officer_xp_events (batch_name);

-- 2) Archive table: snapshot of XP earned per officer per batch per program
CREATE TABLE IF NOT EXISTS public.officer_xp_archives (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL,
  program_id   uuid        NOT NULL,
  batch_name   text        NOT NULL,
  total_xp     int         NOT NULL DEFAULT 0,
  archived_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_xp_archives_user
  ON public.officer_xp_archives (user_id);

CREATE INDEX IF NOT EXISTS idx_xp_archives_program_batch
  ON public.officer_xp_archives (program_id, batch_name);

-- 3) RLS: allow service role full access
ALTER TABLE public.officer_xp_archives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_xp_archives"
  ON public.officer_xp_archives
  FOR ALL
  USING (true)
  WITH CHECK (true);
