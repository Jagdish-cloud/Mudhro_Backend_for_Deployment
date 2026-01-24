# Security Documentation

This document outlines the security measures implemented in the Mudhro FinTech application.

## Overview

The application implements industry-standard security measures to protect against common vulnerabilities and attacks.

## Security Measures

### 1. Authentication & Authorization

- **JWT Tokens**: Secure token-based authentication
- **Password Hashing**: Bcrypt with 10 salt rounds
- **Password Requirements**:
  - Minimum 8 characters, maximum 128 characters
  - Must contain at least one uppercase letter, one lowercase letter, and one number
  - Only alphanumeric and common special characters allowed
- **Rate Limiting**: 
  - Authentication endpoints: 5 attempts per 15 minutes per IP
  - Registration: 10 attempts per hour per IP
  - General API: 100 requests per 15 minutes per IP

### 2. Security Headers (Helmet.js)

- **Content Security Policy**: Restricts resource loading to prevent XSS
- **HSTS**: Forces HTTPS connections in production
- **X-Content-Type-Options**: Prevents MIME type sniffing
- **X-Frame-Options**: Prevents clickjacking attacks
- **X-XSS-Protection**: Enables browser XSS filter
- **Referrer Policy**: Controls referrer information

### 3. Input Validation & Sanitization

- **Express Validator**: Comprehensive input validation on all endpoints
- **Mongo Sanitize**: Protects against NoSQL injection and XSS
- **HTTP Parameter Pollution**: Prevents parameter pollution attacks
- **Request Size Limits**: Maximum 10MB per request

### 4. CORS Configuration

- **Environment-based Origins**: Only allowed origins can access the API
- **Public-facing Support**: Supports wildcard '*' for truly public APIs (use with caution)
- **Domain Whitelisting**: Recommended approach - specify exact domains in ALLOWED_ORIGINS
- **Credentials**: Supports credential-based requests
- **Production Requirements**: Must specify ALLOWED_ORIGINS in production
- **Configuration**: Set via `ALLOWED_ORIGINS` environment variable
  - Use `*` to allow all origins (public-facing APIs)
  - Use comma-separated list for specific domains: `https://domain1.com,https://domain2.com`

### 5. URL Security

- **ID Obfuscation**: Sequential IDs are obfuscated using Hashids to prevent enumeration
- **URL Encryption**: Sensitive values can be encrypted using AES-256
- **URL Sanitization**: Automatic sanitization of URL parameters to prevent injection
- **URL Validation**: Validates URL formats and blocks dangerous patterns
- **Secure Tokens**: Time-limited secure tokens for sensitive operations
- **Automatic Decoding**: Middleware automatically decodes obfuscated IDs

### 6. File Upload Security

- **File Type Validation**: 
  - Images: JPEG, PNG, GIF, WebP only
  - Documents: PDF only
- **File Size Limits**: 
  - Logo uploads: 2MB
  - Invoice/Expense PDFs: 10MB
  - Expense attachments: 10MB (max 5 files)
- **Filename Validation**: Blocks dangerous filename patterns
- **MIME Type Verification**: Validates both extension and MIME type
- **Secure Storage**: Files stored with sanitized, unique filenames

### 7. Database Security

- **Parameterized Queries**: All database queries use parameterized statements (prevents SQL injection)
- **Connection Pooling**: Secure connection management
- **Environment Variables**: Database credentials stored in environment variables

### 8. Error Handling

- **Error Sanitization**: Sensitive information not exposed in error messages
- **Stack Traces**: Only shown in development mode
- **Security Logging**: Security-relevant events are logged

### 9. HTTPS Enforcement

- **Production Mode**: HTTPS required in production environment
- **Header Validation**: Checks X-Forwarded-Proto for proxy setups

## Environment Variables

### Required for Production

```env
# JWT Configuration
JWT_SECRET=<at-least-32-characters-long-secret>
JWT_EXPIRES_IN=2h
REFRESH_TOKEN_EXPIRES_IN=7d

# Database
DB_HOST=<database-host>
DB_PORT=5432
DB_NAME=<database-name>
DB_USER=<database-user>
DB_PASSWORD=<secure-password>

# CORS Configuration
# Option 1: Whitelist specific domains (RECOMMENDED)
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
# Option 2: Allow all origins for public-facing APIs (use with caution)
# ALLOWED_ORIGINS=*

# Environment
NODE_ENV=production

# Rate Limiting (optional)
RATE_LIMIT_ENABLED=true
```

### Development

For development, defaults are provided but should not be used in production.

## Security Best Practices

### For Developers

1. **Never commit secrets**: Use environment variables for all sensitive data
2. **Keep dependencies updated**: Regularly run `npm audit` and update packages
3. **Validate all inputs**: Never trust user input
4. **Use parameterized queries**: Always use parameterized database queries
5. **Log security events**: Monitor authentication attempts and suspicious activity
6. **Regular security audits**: Review code for security vulnerabilities

### For Deployment

1. **Use HTTPS**: Always use HTTPS in production
2. **Set strong secrets**: Use cryptographically secure random strings for JWT_SECRET
3. **Restrict CORS**: Only allow trusted origins
4. **Enable rate limiting**: Keep rate limiting enabled
5. **Monitor logs**: Set up logging and monitoring for security events
6. **Regular updates**: Keep all dependencies and system packages updated
7. **Database security**: Use strong passwords and restrict database access
8. **File permissions**: Ensure upload directories have proper permissions

## Security Checklist

- [x] Password hashing with bcrypt
- [x] JWT authentication
- [x] Rate limiting on authentication endpoints
- [x] Security headers (Helmet)
- [x] Input validation and sanitization
- [x] CORS configuration
- [x] File upload validation
- [x] SQL injection protection (parameterized queries)
- [x] XSS protection
- [x] HTTPS enforcement (production)
- [x] Environment variable validation
- [x] Error handling and sanitization
- [x] Security logging
- [x] URL encoding and encryption
- [x] ID obfuscation
- [x] URL sanitization

## Reporting Security Issues

If you discover a security vulnerability, please report it responsibly:

1. Do not create a public GitHub issue
2. Contact the development team directly
3. Provide detailed information about the vulnerability
4. Allow time for the issue to be addressed before public disclosure

## Security Updates

This document is updated as new security measures are implemented. Review regularly to ensure compliance with security best practices.

