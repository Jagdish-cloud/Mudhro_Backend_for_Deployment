-- Client Portal Authentication Tables Migration
-- This migration creates tables for client authentication and OTP management

-- Client Authentication Table
CREATE TABLE IF NOT EXISTS client_auth (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_email_verified BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_client_auth_client
        FOREIGN KEY (client_id)
        REFERENCES master_clients(id)
        ON DELETE CASCADE
);

-- Indexes for client_auth
CREATE INDEX IF NOT EXISTS idx_client_auth_client_id ON client_auth(client_id);
CREATE INDEX IF NOT EXISTS idx_client_auth_email ON client_auth(email);
CREATE INDEX IF NOT EXISTS idx_client_auth_email_verified ON client_auth(is_email_verified);

-- Trigger to automatically update updatedAt for client_auth
CREATE TRIGGER update_client_auth_updated_at BEFORE UPDATE ON client_auth
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Client Email OTP Table
CREATE TABLE IF NOT EXISTS client_email_otp (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id INTEGER NOT NULL,
    otp_hash TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    attempts INTEGER DEFAULT 0,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_client_otp_client
        FOREIGN KEY (client_id)
        REFERENCES master_clients(id)
        ON DELETE CASCADE
);

-- Indexes for client_email_otp
CREATE INDEX IF NOT EXISTS idx_client_otp_client_id ON client_email_otp(client_id);
CREATE INDEX IF NOT EXISTS idx_client_otp_expires_at ON client_email_otp(expires_at);
CREATE INDEX IF NOT EXISTS idx_client_otp_is_used ON client_email_otp(is_used);
CREATE INDEX IF NOT EXISTS idx_client_otp_client_expires ON client_email_otp(client_id, expires_at);

-- Cleanup function to remove expired OTPs (optional, can be run via cron)
-- This is a helper function, not automatically executed
CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM client_email_otp
    WHERE expires_at < CURRENT_TIMESTAMP
    AND is_used = TRUE;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
