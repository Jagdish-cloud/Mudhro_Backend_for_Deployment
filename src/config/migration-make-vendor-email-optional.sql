-- Migration: Make vendor email optional
-- This migration makes the email field in the vendors table nullable

-- Make email column nullable
ALTER TABLE vendors
    ALTER COLUMN email DROP NOT NULL;

-- Update the unique constraint/index to handle NULL emails
-- PostgreSQL allows multiple NULL values in a unique constraint
-- But we need to ensure that non-NULL emails are still unique per user
-- Drop existing unique constraint if it exists (on email alone)
DO $$
BEGIN
    -- Check if there's a unique constraint on email
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'vendors_email_key'
    ) THEN
        ALTER TABLE vendors DROP CONSTRAINT vendors_email_key;
    END IF;
END $$;

-- Create a partial unique index to ensure non-NULL emails are unique per user
-- This allows multiple NULL emails but ensures non-NULL emails are unique per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_user_email_unique 
ON vendors("userId", email) 
WHERE email IS NOT NULL;
