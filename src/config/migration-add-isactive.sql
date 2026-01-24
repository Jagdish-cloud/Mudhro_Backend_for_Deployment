-- Migration: Add isActive field to master_clients and vendors tables
-- Date: 2025-01-XX

-- Add isActive column to master_clients table
ALTER TABLE master_clients 
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT TRUE;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_master_clients_is_active ON master_clients("isActive");

-- Add isActive column to vendors table
ALTER TABLE vendors 
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT TRUE;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_vendors_is_active ON vendors("isActive");

