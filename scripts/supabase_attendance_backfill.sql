-- ============================================================
-- Attendance Backfill — Google Sheets → Supabase
-- ============================================================
-- STEP 1: Create a staging table to paste your Google Sheet data into.
-- STEP 2: Run the INSERT statements to populate the 3 real tables.
-- STEP 3: Drop the staging table.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- STEP 1: Create staging table
-- Columns match the Google Sheet columns exactly.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public._attendance_staging (
  officer_name      text,
  date              text,   -- YYYY-MM-DD  (or any date string — cast below)
  check_in          text,   -- HH:MM or HH:MM:SS
  check_out         text,
  check_in_iso      text,   -- ISO 8601 timestamptz string (optional)
  check_out_iso     text,
  location_lat      text,   -- numeric as text (optional)
  location_lng      text,
  location_accuracy text,
  location_confirmed_at text  -- ISO 8601 timestamptz string (optional)
);

-- ────────────────────────────────────────────────────────────
-- STEP 1b: Paste your Google Sheet rows here.
-- You can also import via Supabase CSV import into this table.
-- Example rows (replace with real data):
-- ────────────────────────────────────────────────────────────
-- INSERT INTO public._attendance_staging VALUES
--   ('John Silva',   '2026-03-01', '08:31:00', '17:05:00', '2026-03-01T03:01:00Z', '2026-03-01T11:35:00Z', '6.9271',  '79.8612', '12.5', '2026-03-01T03:05:00Z'),
--   ('Priya Perera', '2026-03-01', '08:45:00', '17:10:00', '2026-03-01T03:15:00Z', '2026-03-01T11:40:00Z', '6.9300',  '79.8600', '8.0',  '2026-03-01T03:20:00Z'),
--   ('John Silva',   '2026-03-02', '08:28:00', NULL,        NULL,                   NULL,                   NULL,      NULL,      NULL,   NULL);


-- ────────────────────────────────────────────────────────────
-- STEP 2a: Backfill attendance_records
-- One row per officer per day (check-in / check-out only).
-- Matches on (user_id, date) — skips duplicates automatically.
-- ────────────────────────────────────────────────────────────
INSERT INTO public.attendance_records (
  user_id,
  officer_name,
  date,
  check_in,
  check_out,
  check_in_iso,
  check_out_iso,
  created_at,
  updated_at
)
SELECT
  -- Look up user_id from auth.users by display name
  u.id                                        AS user_id,
  s.officer_name,
  s.date::date,
  NULLIF(TRIM(s.check_in),  '')::time         AS check_in,
  NULLIF(TRIM(s.check_out), '')::time         AS check_out,
  NULLIF(TRIM(s.check_in_iso),  '')::timestamptz AS check_in_iso,
  NULLIF(TRIM(s.check_out_iso), '')::timestamptz AS check_out_iso,
  now()                                       AS created_at,
  now()                                       AS updated_at

FROM public._attendance_staging s

-- Join auth.users by display name (case-insensitive)
LEFT JOIN auth.users u
  ON LOWER(TRIM(u.raw_user_meta_data->>'name')) = LOWER(TRIM(s.officer_name))

WHERE
  s.officer_name IS NOT NULL
  AND s.date IS NOT NULL
  AND u.id IS NOT NULL   -- only rows where we found a matching user

ON CONFLICT (user_id, date) DO UPDATE SET
  check_in      = EXCLUDED.check_in,
  check_out     = EXCLUDED.check_out,
  check_in_iso  = EXCLUDED.check_in_iso,
  check_out_iso = EXCLUDED.check_out_iso,
  updated_at    = now();


-- ────────────────────────────────────────────────────────────
-- STEP 2b: Backfill attendance_locations
-- Only for rows that have lat/lng data.
-- ────────────────────────────────────────────────────────────
INSERT INTO public.attendance_locations (
  attendance_record_id,
  user_id,
  officer_name,
  date,
  lat,
  lng,
  accuracy,
  confirmed_at
)
SELECT
  r.id                                              AS attendance_record_id,
  r.user_id,
  s.officer_name,
  s.date::date,
  NULLIF(TRIM(s.location_lat),      '')::numeric    AS lat,
  NULLIF(TRIM(s.location_lng),      '')::numeric    AS lng,
  NULLIF(TRIM(s.location_accuracy), '')::numeric    AS accuracy,
  COALESCE(
    NULLIF(TRIM(s.location_confirmed_at), '')::timestamptz,
    NULLIF(TRIM(s.check_in_iso),          '')::timestamptz,
    now()
  )                                                 AS confirmed_at

FROM public._attendance_staging s

-- Match back to the attendance_records rows we just inserted
JOIN public.attendance_records r
  ON LOWER(TRIM(r.officer_name)) = LOWER(TRIM(s.officer_name))
  AND r.date = s.date::date

WHERE
  NULLIF(TRIM(s.location_lat), '') IS NOT NULL
  AND NULLIF(TRIM(s.location_lng), '') IS NOT NULL

ON CONFLICT (attendance_record_id) DO UPDATE SET
  lat          = EXCLUDED.lat,
  lng          = EXCLUDED.lng,
  accuracy     = EXCLUDED.accuracy,
  confirmed_at = EXCLUDED.confirmed_at;


-- ────────────────────────────────────────────────────────────
-- STEP 3: Verify — check counts match
-- ────────────────────────────────────────────────────────────
SELECT
  'staging rows'            AS label, COUNT(*) AS cnt FROM public._attendance_staging
UNION ALL
SELECT
  'attendance_records'      AS label, COUNT(*) FROM public.attendance_records
UNION ALL
SELECT
  'attendance_locations'    AS label, COUNT(*) FROM public.attendance_locations;


-- ────────────────────────────────────────────────────────────
-- STEP 4: Drop staging table (run after verifying above)
-- ────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public._attendance_staging;
