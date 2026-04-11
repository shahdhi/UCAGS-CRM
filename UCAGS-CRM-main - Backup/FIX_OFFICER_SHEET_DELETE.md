# Fix: Officer Sheet Delete Error

## Problem
When attempting to delete an officer custom sheet, the system throws the error:
```
Delete sheet error: Error: Officer custom sheets table not found
```

However, the table exists in Supabase and the sheet is present.

## Root Cause
The code in `backend/modules/crmLeads/crmLeadsService.js` (line 1451) tries to SELECT a column `created_by_user_id` that doesn't exist in the `officer_custom_sheets` table:

```javascript
.select('sheet_name, officer_name, created_by_user_id')
```

This causes a Supabase error which is incorrectly interpreted as "table not found" by the error handler at lines 1456-1460.

## Solution

### Step 1: Add Missing Column to Supabase

Run this SQL migration in your Supabase SQL Editor:

```sql
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
```

### Step 2: Code Changes (Already Applied)

The following files have been updated to include the `created_by_user_id` field:

1. **scripts/supabase_officer_custom_sheets.sql** - Updated table definition
2. **scripts/supabase_officer_custom_sheets_add_user_id.sql** - Migration script (new file)
3. **backend/modules/crmLeads/crmLeadsService.js** - Now sets `created_by_user_id` when creating sheets
4. **backend/modules/batches/officerSheetsService.js** - Now accepts and sets `created_by_user_id`

## Testing the Fix

After running the SQL migration:

1. Try deleting an existing officer sheet - it should work now (the column will be NULL for existing sheets, but the code handles that)
2. Create a new officer sheet - it will include the `created_by_user_id` for better ownership tracking
3. Delete the newly created sheet - it will verify ownership using both `officer_name` and `created_by_user_id`

## Why This Happened

The code was written to support robust ownership verification using the Supabase Auth user ID, but the database migration to add the column was never applied. The code expected the column to exist, but when it didn't, Supabase returned an error that was misinterpreted as "table not found".

## Prevention

Future database schema changes should:
1. Always create a migration SQL file
2. Document the migration in CHANGELOG
3. Ensure the migration is applied before deploying code that uses new columns
