-- Migration: Add created_by_user_id column to officer_custom_sheets table
-- This column is used for robust ownership verification when deleting sheets

-- Add the column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'officer_custom_sheets' 
        AND column_name = 'created_by_user_id'
    ) THEN
        ALTER TABLE officer_custom_sheets 
        ADD COLUMN created_by_user_id UUID;
        
        -- Add comment
        COMMENT ON COLUMN officer_custom_sheets.created_by_user_id IS 'Supabase Auth UUID of the user who created this sheet (for robust ownership verification)';
        
        RAISE NOTICE 'Column created_by_user_id added to officer_custom_sheets table';
    ELSE
        RAISE NOTICE 'Column created_by_user_id already exists in officer_custom_sheets table';
    END IF;
END $$;
