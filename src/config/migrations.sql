-- Migration: Add currency column to users table
-- Add currency column if it doesn't exist
ALTER TABLE users
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'INR';

-- Migration: Create user_sessions table for login/logout tracking
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "loginAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logoutAt" TIMESTAMP,
    "ipAddress" VARCHAR(45),
    "userAgent" TEXT,
    "sessionDuration" INTEGER, -- Duration in seconds
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_sessions_user 
        FOREIGN KEY ("userId") 
        REFERENCES users(id) 
        ON DELETE CASCADE
);

-- Indexes for user_sessions
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions("userId");
CREATE INDEX IF NOT EXISTS idx_user_sessions_login_at ON user_sessions("loginAt");
CREATE INDEX IF NOT EXISTS idx_user_sessions_logout_at ON user_sessions("logoutAt");

-- Trigger to automatically update updatedAt for user_sessions
CREATE TRIGGER update_user_sessions_updated_at BEFORE UPDATE ON user_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

