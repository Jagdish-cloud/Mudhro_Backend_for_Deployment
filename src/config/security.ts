import dotenv from 'dotenv';

dotenv.config();

/**
 * Security configuration and validation
 */

interface SecurityConfig {
  jwtSecret: string;
  nodeEnv: string;
  allowedOrigins: string[];
  dbPassword: string;
  rateLimitEnabled: boolean;
  httpsOnly: boolean;
}

/**
 * Validate required environment variables for security
 */
export const validateSecurityConfig = (): SecurityConfig => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const jwtSecret = process.env.JWT_SECRET;
  const dbPassword = process.env.DB_PASSWORD;

  // Critical security checks
  if (!jwtSecret || jwtSecret.length < 32) {
    if (nodeEnv === 'production') {
      throw new Error(
        'JWT_SECRET must be set and at least 32 characters long in production'
      );
    }
    console.warn(
      '⚠️  WARNING: JWT_SECRET is not set or too short. Using default (INSECURE for production)'
    );
  }

  if (nodeEnv === 'production' && (!dbPassword || dbPassword === 'root')) {
    throw new Error(
      'DB_PASSWORD must be set to a secure value in production (cannot be default)'
    );
  }

  // CORS origins configuration
  // Special value '*' allows all origins (use with caution, only for truly public APIs)
  // For public-facing apps, specify your frontend domains explicitly
  let allowedOrigins: string[] = [];
  
  if (process.env.ALLOWED_ORIGINS) {
    if (process.env.ALLOWED_ORIGINS === '*') {
      // Allow all origins (public-facing application)
      allowedOrigins = ['*'];
      if (nodeEnv === 'production') {
        console.warn('⚠️  WARNING: CORS is set to allow all origins (*). Ensure this is intentional for a public-facing API.');
      }
    } else {
      // Parse comma-separated list of allowed origins
      allowedOrigins = process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);
    }
  } else {
    // Defaults based on environment
    if (nodeEnv === 'production') {
      throw new Error(
        'ALLOWED_ORIGINS must be set in production environment. Use "*" for public-facing APIs or specify allowed domains.'
      );
    }
    // Development defaults - allow all origins for easier mobile/network testing
    // In production, you should explicitly set ALLOWED_ORIGINS
    allowedOrigins = ['*'];
    console.log('ℹ️  Development mode: CORS allows all origins for mobile/network testing');
  }

  return {
    jwtSecret: jwtSecret || 'your-super-secret-jwt-key-change-this-in-production',
    nodeEnv,
    allowedOrigins,
    dbPassword: dbPassword || '',
    rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    httpsOnly: nodeEnv === 'production',
  };
};

/**
 * Get security configuration
 */
export const getSecurityConfig = (): SecurityConfig => {
  return validateSecurityConfig();
};

/**
 * Check if running in production
 */
export const isProduction = (): boolean => {
  return process.env.NODE_ENV === 'production';
};

/**
 * Check if HTTPS is required
 */
export const isHttpsRequired = (): boolean => {
  return isProduction();
};

