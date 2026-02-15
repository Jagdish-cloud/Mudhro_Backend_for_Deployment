import pool from '../config/database';
import { hashPassword, comparePassword } from '../utils/password';
import { AppError } from '../middleware/errorHandler';
import crypto from 'crypto';

const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10);
const MAX_OTP_ATTEMPTS = parseInt(process.env.MAX_OTP_ATTEMPTS || '3', 10);

/**
 * Create authentication record for a client
 */
export const createClientAuth = async (
  clientId: number,
  email: string,
  password: string
): Promise<void> => {
  const client = await pool.connect();

  try {
    // Verify client exists
    const clientCheck = await client.query(
      'SELECT id, email FROM master_clients WHERE id = $1',
      [clientId]
    );

    if (clientCheck.rows.length === 0) {
      throw new AppError('Client not found', 404);
    }

    // Check if auth record already exists
    const existingAuth = await client.query(
      'SELECT id FROM client_auth WHERE client_id = $1 OR email = $2',
      [clientId, email.toLowerCase()]
    );

    if (existingAuth.rows.length > 0) {
      throw new AppError('Client authentication already exists for this client or email', 400);
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Insert auth record
    await client.query(
      `INSERT INTO client_auth (client_id, email, password_hash, is_email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [clientId, email.toLowerCase(), passwordHash]
    );
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error creating client auth:', error);
    throw new AppError('Failed to create client authentication', 500);
  } finally {
    client.release();
  }
};

/**
 * Register a new client portal account
 * Verifies email exists in master_clients before creating auth record
 */
export const registerClientAuth = async (
  email: string,
  password: string
): Promise<{ clientId: number; email: string; fullName: string }> => {
  const client = await pool.connect();

  try {
    // Verify email exists in master_clients
    const clientCheck = await client.query(
      'SELECT id, email, "fullName" FROM master_clients WHERE email = $1',
      [email.toLowerCase()]
    );

    if (clientCheck.rows.length === 0) {
      throw new AppError('Email not found. Please contact your administrator to set up your account.', 404);
    }

    const clientData = clientCheck.rows[0];
    const clientId = clientData.id;

    // Check if auth record already exists
    const existingAuth = await client.query(
      'SELECT id FROM client_auth WHERE client_id = $1 OR email = $2',
      [clientId, email.toLowerCase()]
    );

    if (existingAuth.rows.length > 0) {
      throw new AppError('Account already exists. Please login instead.', 400);
    }

    // Validate password strength (minimum 8 characters)
    if (password.length < 8) {
      throw new AppError('Password must be at least 8 characters long', 400);
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Insert auth record
    await client.query(
      `INSERT INTO client_auth (client_id, email, password_hash, is_email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [clientId, email.toLowerCase(), passwordHash]
    );

    return {
      clientId,
      email: email.toLowerCase(),
      fullName: clientData.fullName,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error registering client auth:', error);
    throw new AppError('Failed to create client account', 500);
  } finally {
    client.release();
  }
};

/**
 * Validate client password and return client info
 */
export const validateClientPassword = async (
  email: string,
  password: string
): Promise<{ clientId: number; email: string; fullName: string }> => {
  const client = await pool.connect();

  try {
    // Get auth record
    const authResult = await client.query(
      `SELECT ca.client_id, ca.email, ca.password_hash, mc."fullName"
       FROM client_auth ca
       INNER JOIN master_clients mc ON ca.client_id = mc.id
       WHERE ca.email = $1`,
      [email.toLowerCase()]
    );

    if (authResult.rows.length === 0) {
      throw new AppError('Invalid email or password', 401);
    }

    const auth = authResult.rows[0];

    // Verify password
    const isPasswordValid = await comparePassword(password, auth.password_hash);
    if (!isPasswordValid) {
      throw new AppError('Invalid email or password', 401);
    }

    return {
      clientId: auth.client_id,
      email: auth.email,
      fullName: auth.fullName,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error validating client password:', error);
    throw new AppError('Failed to validate client credentials', 500);
  } finally {
    client.release();
  }
};

/**
 * Generate and store OTP for client
 * Returns the plain OTP (to be sent via email)
 */
export const generateOTP = async (
  clientId: number,
  email: string
): Promise<string> => {
  const client = await pool.connect();

  try {
    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();

    // Hash OTP
    const otpHash = await hashPassword(otp);

    // Calculate expiry time
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + OTP_EXPIRY_MINUTES);

    // Invalidate any existing unused OTPs for this client
    await client.query(
      `UPDATE client_email_otp 
       SET is_used = TRUE 
       WHERE client_id = $1 AND is_used = FALSE AND expires_at > CURRENT_TIMESTAMP`,
      [clientId]
    );

    // Insert new OTP record
    await client.query(
      `INSERT INTO client_email_otp (client_id, otp_hash, expires_at, attempts, is_used, created_at)
       VALUES ($1, $2, $3, 0, FALSE, CURRENT_TIMESTAMP)`,
      [clientId, otpHash, expiresAt]
    );

    return otp;
  } catch (error) {
    console.error('Error generating OTP:', error);
    throw new AppError('Failed to generate OTP', 500);
  } finally {
    client.release();
  }
};

/**
 * Verify OTP with attempt tracking
 */
export const verifyOTP = async (
  email: string,
  otp: string
): Promise<{ clientId: number; email: string }> => {
  const client = await pool.connect();

  try {
    // Get client auth to find client_id
    const authResult = await client.query(
      'SELECT client_id FROM client_auth WHERE email = $1',
      [email.toLowerCase()]
    );

    if (authResult.rows.length === 0) {
      throw new AppError('Invalid email', 401);
    }

    const clientId = authResult.rows[0].client_id;

    // Get most recent unused OTP for this client
    const otpResult = await client.query(
      `SELECT id, otp_hash, expires_at, attempts, is_used
       FROM client_email_otp
       WHERE client_id = $1 AND is_used = FALSE
       ORDER BY created_at DESC
       LIMIT 1`,
      [clientId]
    );

    if (otpResult.rows.length === 0) {
      throw new AppError('No valid OTP found. Please request a new OTP', 400);
    }

    const otpRecord = otpResult.rows[0];

    // Check if OTP is expired
    const expiresAt = new Date(otpRecord.expires_at);
    if (expiresAt < new Date()) {
      throw new AppError('OTP has expired. Please request a new OTP', 400);
    }

    // Check if already used
    if (otpRecord.is_used) {
      throw new AppError('OTP has already been used', 400);
    }

    // Check attempts
    if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
      // Mark as used to prevent further attempts
      await client.query(
        'UPDATE client_email_otp SET is_used = TRUE WHERE id = $1',
        [otpRecord.id]
      );
      throw new AppError('Maximum OTP attempts exceeded. Please request a new OTP', 400);
    }

    // Verify OTP
    const isOtpValid = await comparePassword(otp, otpRecord.otp_hash);

    if (!isOtpValid) {
      // Increment attempts
      await client.query(
        'UPDATE client_email_otp SET attempts = attempts + 1 WHERE id = $1',
        [otpRecord.id]
      );

      const remainingAttempts = MAX_OTP_ATTEMPTS - (otpRecord.attempts + 1);
      throw new AppError(
        `Invalid OTP. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining`,
        400
      );
    }

    // Mark OTP as used
    await client.query(
      'UPDATE client_email_otp SET is_used = TRUE WHERE id = $1',
      [otpRecord.id]
    );

    return {
      clientId,
      email: email.toLowerCase(),
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error verifying OTP:', error);
    throw new AppError('Failed to verify OTP', 500);
  } finally {
    client.release();
  }
};

/**
 * Update last login timestamp
 */
export const updateLastLogin = async (clientId: number): Promise<void> => {
  const client = await pool.connect();

  try {
    await client.query(
      'UPDATE client_auth SET last_login = CURRENT_TIMESTAMP WHERE client_id = $1',
      [clientId]
    );
  } catch (error) {
    console.error('Error updating last login:', error);
    // Don't throw error, this is not critical
  } finally {
    client.release();
  }
};
