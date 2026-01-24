-- Migration: Add new columns and tables for new features
-- Run this migration to update existing database

-- 1. Add currency column to invoices table
ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'INR';

-- 2. Add expenseScreenVisitCount column to user_sessions table
ALTER TABLE user_sessions
    ADD COLUMN IF NOT EXISTS "expenseScreenVisitCount" INTEGER DEFAULT 0;

-- 3. Create client_documents table if it doesn't exist
CREATE TABLE IF NOT EXISTS client_documents (
    id SERIAL PRIMARY KEY,
    "clientId" INTEGER NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" VARCHAR(100),
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_client_documents_client 
        FOREIGN KEY ("clientId") 
        REFERENCES master_clients(id) 
        ON DELETE CASCADE
);

-- 4. Create indexes for client_documents
CREATE INDEX IF NOT EXISTS idx_client_documents_client_id ON client_documents("clientId");

-- 5. Create trigger for client_documents updatedAt
CREATE TRIGGER update_client_documents_updated_at BEFORE UPDATE ON client_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Create vendor_documents table if it doesn't exist
CREATE TABLE IF NOT EXISTS vendor_documents (
    id SERIAL PRIMARY KEY,
    "vendorId" INTEGER NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" VARCHAR(100),
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vendor_documents_vendor 
        FOREIGN KEY ("vendorId") 
        REFERENCES vendors(id) 
        ON DELETE CASCADE
);

-- 7. Create indexes for vendor_documents
CREATE INDEX IF NOT EXISTS idx_vendor_documents_vendor_id ON vendor_documents("vendorId");

-- 8. Create trigger for vendor_documents updatedAt
CREATE TRIGGER update_vendor_documents_updated_at BEFORE UPDATE ON vendor_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Migration complete
SELECT 'Migration completed successfully' AS status;

