-- ============================================================
-- Officer XP System
-- ============================================================

-- Full audit log of every XP change
CREATE TABLE IF NOT EXISTS officer_xp_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  event_type      text NOT NULL,  -- 'lead_contacted', 'followup_completed', 'registration_received', etc.
  xp              int  NOT NULL,  -- positive or negative
  reference_id    text,           -- lead id, followup id, registration id, payment id, etc.
  reference_type  text,           -- 'lead', 'followup', 'registration', 'payment', 'attendance', 'report', 'checklist'
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_officer_xp_events_user_id    ON officer_xp_events (user_id);
CREATE INDEX IF NOT EXISTS idx_officer_xp_events_created_at ON officer_xp_events (created_at);
CREATE INDEX IF NOT EXISTS idx_officer_xp_events_event_type ON officer_xp_events (event_type);

-- Fast lookup: one row per officer with total XP
CREATE TABLE IF NOT EXISTS officer_xp_summary (
  user_id      uuid PRIMARY KEY,
  total_xp     int NOT NULL DEFAULT 0,
  last_updated timestamptz NOT NULL DEFAULT now()
);

-- RLS: allow service role full access
ALTER TABLE officer_xp_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE officer_xp_summary ENABLE ROW LEVEL SECURITY;

-- Allow the service role (backend) to do everything
CREATE POLICY "service_role_all_xp_events"  ON officer_xp_events  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_xp_summary" ON officer_xp_summary FOR ALL USING (true) WITH CHECK (true);
