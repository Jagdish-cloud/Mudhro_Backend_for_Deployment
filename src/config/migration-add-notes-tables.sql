-- Migration: Add client_notes and vendor_notes tables
-- Date: 2025-01-XX

-- Client Notes Table Schema
CREATE TABLE IF NOT EXISTS client_notes (
    id SERIAL PRIMARY KEY,
    "clientId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    note TEXT NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_client_notes_client 
        FOREIGN KEY ("clientId") 
        REFERENCES master_clients(id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_client_notes_user 
        FOREIGN KEY ("userId") 
        REFERENCES users(id) 
        ON DELETE CASCADE
);

-- Indexes for client_notes
CREATE INDEX IF NOT EXISTS idx_client_notes_client_id ON client_notes("clientId");
CREATE INDEX IF NOT EXISTS idx_client_notes_user_id ON client_notes("userId");
CREATE INDEX IF NOT EXISTS idx_client_notes_created_at ON client_notes("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_client_notes_client_created_at ON client_notes("clientId", "createdAt" DESC);

-- Trigger to automatically update updatedAt for client_notes
CREATE TRIGGER update_client_notes_updated_at BEFORE UPDATE ON client_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Vendor Notes Table Schema
CREATE TABLE IF NOT EXISTS vendor_notes (
    id SERIAL PRIMARY KEY,
    "vendorId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    note TEXT NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vendor_notes_vendor 
        FOREIGN KEY ("vendorId") 
        REFERENCES vendors(id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_vendor_notes_user 
        FOREIGN KEY ("userId") 
        REFERENCES users(id) 
        ON DELETE CASCADE
);

-- Indexes for vendor_notes
CREATE INDEX IF NOT EXISTS idx_vendor_notes_vendor_id ON vendor_notes("vendorId");
CREATE INDEX IF NOT EXISTS idx_vendor_notes_user_id ON vendor_notes("userId");
CREATE INDEX IF NOT EXISTS idx_vendor_notes_created_at ON vendor_notes("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_notes_vendor_created_at ON vendor_notes("vendorId", "createdAt" DESC);

-- Trigger to automatically update updatedAt for vendor_notes
CREATE TRIGGER update_vendor_notes_updated_at BEFORE UPDATE ON vendor_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

