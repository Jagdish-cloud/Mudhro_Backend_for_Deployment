-- Migration: Create project_clients junction table and migrate data
-- This migration creates the junction table for many-to-many relationship
-- between projects and clients, and migrates existing data from master_clients.projectId

-- Step 1: Create the junction table if it doesn't exist
CREATE TABLE IF NOT EXISTS project_clients (
    id SERIAL PRIMARY KEY,
    "projectId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_project_clients_project 
        FOREIGN KEY ("projectId") 
        REFERENCES projects(id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_project_clients_client 
        FOREIGN KEY ("clientId") 
        REFERENCES master_clients(id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_project_clients_user 
        FOREIGN KEY ("userId") 
        REFERENCES users(id) 
        ON DELETE CASCADE,
    CONSTRAINT uq_project_clients 
        UNIQUE ("projectId", "clientId")
);

-- Step 2: Create indexes
CREATE INDEX IF NOT EXISTS idx_project_clients_project_id ON project_clients("projectId");
CREATE INDEX IF NOT EXISTS idx_project_clients_client_id ON project_clients("clientId");
CREATE INDEX IF NOT EXISTS idx_project_clients_user_id ON project_clients("userId");
CREATE INDEX IF NOT EXISTS idx_project_clients_composite ON project_clients("projectId", "clientId");

-- Step 3: Create trigger for updatedAt
CREATE TRIGGER update_project_clients_updated_at BEFORE UPDATE ON project_clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 4: Migrate existing data from master_clients.projectId to project_clients
-- Only insert records where projectId is not NULL and the relationship doesn't already exist
INSERT INTO project_clients ("projectId", "clientId", "userId", "createdAt", "updatedAt")
SELECT 
    mc."projectId",
    mc.id as "clientId",
    mc."userId",
    mc."createdAt",
    mc."updatedAt"
FROM master_clients mc
WHERE mc."projectId" IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM project_clients pc
        WHERE pc."projectId" = mc."projectId"
            AND pc."clientId" = mc.id
    )
ON CONFLICT ("projectId", "clientId") DO NOTHING;

-- Note: The projectId column in master_clients is kept for backward compatibility
-- It can be removed in a future migration after verifying all functionality works correctly
