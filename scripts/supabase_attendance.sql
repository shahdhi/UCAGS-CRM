-- ============================================================
-- Attendance Tables — Supabase
-- Three separate tables:
--   1. attendance_records  — daily check-in / check-out
--   2. leave_requests      — officer leave requests & admin decisions
--   3. attendance_locations — GPS location captured at check-in
-- Plus:
--   4. attendance_overrides — admin manual day-status adjustments
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TABLE 1: Daily attendance records (one row per officer per day)
-- Stores only check-in / check-out times.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  officer_name  text        NOT NULL,
  date          date        NOT NULL,
  check_in      time,
  check_out     time,
  check_in_iso  timestamptz,
  check_out_iso timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_user_id ON public.attendance_records (user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_date    ON public.attendance_records (date);
CREATE INDEX IF NOT EXISTS idx_attendance_records_officer ON public.attendance_records (officer_name);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_attendance_records"
  ON public.attendance_records FOR ALL USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────
-- TABLE 2: Leave requests
-- One row per leave application; admin approves / rejects.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id            text        PRIMARY KEY DEFAULT ('LR-' || extract(epoch from now())::bigint || '-' || substr(md5(random()::text), 1, 6)),
  user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  officer_name  text        NOT NULL,
  leave_date    date        NOT NULL,
  leave_type    text        NOT NULL DEFAULT 'full_day'
                            CHECK (leave_type IN ('full_day', 'morning', 'afternoon')),
  reason        text        NOT NULL,
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_name    text,
  admin_comment text,
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_officer ON public.leave_requests (officer_name);
CREATE INDEX IF NOT EXISTS idx_leave_requests_date    ON public.leave_requests (leave_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status  ON public.leave_requests (status);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_leave_requests"
  ON public.leave_requests FOR ALL USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────
-- TABLE 3: Attendance locations
-- One row per officer per day — GPS coordinates captured at check-in.
-- Linked to attendance_records via attendance_record_id (FK).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attendance_locations (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_record_id uuid        NOT NULL REFERENCES public.attendance_records(id) ON DELETE CASCADE,
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  officer_name         text        NOT NULL,
  date                 date        NOT NULL,
  lat                  numeric     NOT NULL,
  lng                  numeric     NOT NULL,
  accuracy             numeric,
  confirmed_at         timestamptz NOT NULL DEFAULT now(),

  UNIQUE (attendance_record_id)   -- one location entry per attendance record
);

CREATE INDEX IF NOT EXISTS idx_attendance_locations_record  ON public.attendance_locations (attendance_record_id);
CREATE INDEX IF NOT EXISTS idx_attendance_locations_user_id ON public.attendance_locations (user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_locations_date    ON public.attendance_locations (date);
CREATE INDEX IF NOT EXISTS idx_attendance_locations_officer ON public.attendance_locations (officer_name);

ALTER TABLE public.attendance_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_attendance_locations"
  ON public.attendance_locations FOR ALL USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────
-- TABLE 4: Attendance overrides
-- Admin manual day-status adjustments (holiday, absent, etc.)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attendance_overrides (
  id           uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_name text  NOT NULL,
  date         date  NOT NULL,
  status       text  NOT NULL CHECK (status IN ('present', 'absent', 'leave', 'holiday')),
  updated_by   text,
  updated_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (officer_name, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_overrides_officer ON public.attendance_overrides (officer_name);
CREATE INDEX IF NOT EXISTS idx_attendance_overrides_date    ON public.attendance_overrides (date);

ALTER TABLE public.attendance_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_attendance_overrides"
  ON public.attendance_overrides FOR ALL USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────
-- MIGRATION: Move existing location data from attendance_records
-- into the new attendance_locations table.
--
-- NOTE: Only run this block if your attendance_records table still
-- has the old location columns (location_lat, location_lng, etc.).
-- If those columns don't exist, skip this entire block.
-- ────────────────────────────────────────────────────────────
-- INSERT INTO public.attendance_locations (
--   attendance_record_id,
--   user_id,
--   officer_name,
--   date,
--   lat,
--   lng,
--   accuracy,
--   confirmed_at
-- )
-- SELECT
--   id                AS attendance_record_id,
--   user_id,
--   officer_name,
--   date,
--   location_lat      AS lat,
--   location_lng      AS lng,
--   location_accuracy AS accuracy,
--   COALESCE(location_confirmed_at, updated_at) AS confirmed_at
-- FROM public.attendance_records
-- WHERE location_lat IS NOT NULL
--   AND location_lng IS NOT NULL
-- ON CONFLICT (attendance_record_id) DO NOTHING;

-- After running the migration above, drop the old location columns:
-- ALTER TABLE public.attendance_records DROP COLUMN IF EXISTS location_confirmed_at;
-- ALTER TABLE public.attendance_records DROP COLUMN IF EXISTS location_lat;
-- ALTER TABLE public.attendance_records DROP COLUMN IF EXISTS location_lng;
-- ALTER TABLE public.attendance_records DROP COLUMN IF EXISTS location_accuracy;
