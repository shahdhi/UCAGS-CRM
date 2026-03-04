-- Officer Custom Sheets Table
-- Tracks sheets created by individual officers for their personal lead management
-- Officers can only see and use sheets they created themselves
-- Admins can see all officer sheets in the lead management dropdown

CREATE TABLE IF NOT EXISTS officer_custom_sheets (
  id BIGSERIAL PRIMARY KEY,
  batch_name TEXT NOT NULL,
  officer_name TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint: one sheet per officer per batch with that name
  CONSTRAINT officer_custom_sheets_unique UNIQUE (batch_name, officer_name, sheet_name)
);

-- Index for fast lookups by officer
CREATE INDEX IF NOT EXISTS idx_officer_custom_sheets_officer 
  ON officer_custom_sheets(officer_name, batch_name);

-- Index for fast lookups by batch (for admin to see all officer sheets)
CREATE INDEX IF NOT EXISTS idx_officer_custom_sheets_batch 
  ON officer_custom_sheets(batch_name);

-- Index for the unique constraint lookup
CREATE INDEX IF NOT EXISTS idx_officer_custom_sheets_lookup 
  ON officer_custom_sheets(batch_name, officer_name, sheet_name);

-- Add RLS (Row Level Security) policies
ALTER TABLE officer_custom_sheets ENABLE ROW LEVEL SECURITY;

-- Officers can only see their own sheets
CREATE POLICY officer_custom_sheets_select_own ON officer_custom_sheets
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'authenticated' 
    AND (
      -- Officers see only their own sheets
      (
        (auth.jwt() -> 'user_metadata' ->> 'role') IN ('officer', 'admission_officer')
        AND officer_name = (auth.jwt() -> 'user_metadata' ->> 'name')
      )
      -- Admins see all sheets
      OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    )
  );

-- Officers can only insert their own sheets
CREATE POLICY officer_custom_sheets_insert_own ON officer_custom_sheets
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'role' = 'authenticated'
    AND (
      -- Officers can create sheets for themselves
      (
        (auth.jwt() -> 'user_metadata' ->> 'role') IN ('officer', 'admission_officer')
        AND officer_name = (auth.jwt() -> 'user_metadata' ->> 'name')
      )
      -- Admins can create sheets for any officer
      OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    )
  );

-- Officers can only delete their own sheets
CREATE POLICY officer_custom_sheets_delete_own ON officer_custom_sheets
  FOR DELETE
  USING (
    auth.jwt() ->> 'role' = 'authenticated'
    AND (
      -- Officers can delete only their own sheets
      (
        (auth.jwt() -> 'user_metadata' ->> 'role') IN ('officer', 'admission_officer')
        AND officer_name = (auth.jwt() -> 'user_metadata' ->> 'name')
      )
      -- Admins can delete any officer's sheets
      OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    )
  );

-- Officers can only update their own sheets, admins can update any
CREATE POLICY officer_custom_sheets_update_own ON officer_custom_sheets
  FOR UPDATE
  USING (
    auth.jwt() ->> 'role' = 'authenticated'
    AND (
      (
        (auth.jwt() -> 'user_metadata' ->> 'role') IN ('officer', 'admission_officer')
        AND officer_name = (auth.jwt() -> 'user_metadata' ->> 'name')
      )
      OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    )
  );

-- Add comment for documentation
COMMENT ON TABLE officer_custom_sheets IS 'Stores custom sheets created by individual officers. Officers can only see and use their own sheets. Admins can see all officer sheets in lead management.';
COMMENT ON COLUMN officer_custom_sheets.batch_name IS 'The batch this sheet belongs to (e.g., "Batch-14")';
COMMENT ON COLUMN officer_custom_sheets.officer_name IS 'Display name of the officer who created this sheet';
COMMENT ON COLUMN officer_custom_sheets.sheet_name IS 'Name of the custom sheet (normalized, e.g., "My Follow-ups")';
