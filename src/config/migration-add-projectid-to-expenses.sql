-- Migration: Add projectId column to expenses table
-- Date: 2026-01-28
-- This migration adds projectId column to link expenses to projects
-- Note: Expenses require mandatory project association (unlike invoices where it's optional)

-- Add projectId column to expenses table (nullable initially for backward compatibility)
ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS "projectId" INTEGER DEFAULT NULL;

-- Add foreign key constraint for projectId
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_expenses_project'
    ) THEN
        ALTER TABLE expenses
            ADD CONSTRAINT fk_expenses_project 
            FOREIGN KEY ("projectId") 
            REFERENCES projects(id) 
            ON DELETE RESTRICT;
    END IF;
END $$;

-- Add index on projectId for better query performance
CREATE INDEX IF NOT EXISTS idx_expenses_project_id ON expenses("projectId");

-- Note: After backfilling existing expenses with projectId values,
-- you may want to enforce NOT NULL constraint:
-- ALTER TABLE expenses ALTER COLUMN "projectId" SET NOT NULL;
