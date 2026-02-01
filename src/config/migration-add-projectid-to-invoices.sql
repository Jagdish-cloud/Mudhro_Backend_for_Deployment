-- Migration: Add projectId column to invoices table
-- Date: 2026-01-28
-- This migration adds projectId column to link invoices to projects

-- Add projectId column to invoices table
ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS "projectId" INTEGER DEFAULT NULL;

-- Add foreign key constraint for projectId
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_invoices_project'
    ) THEN
        ALTER TABLE invoices
            ADD CONSTRAINT fk_invoices_project 
            FOREIGN KEY ("projectId") 
            REFERENCES projects(id) 
            ON DELETE SET NULL;
    END IF;
END $$;

-- Add index on projectId for better query performance
CREATE INDEX IF NOT EXISTS idx_invoices_project_id ON invoices("projectId");
