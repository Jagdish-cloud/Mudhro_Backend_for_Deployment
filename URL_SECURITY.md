# URL Encoding/Encryption Guide

This document explains the URL encoding and encryption features implemented for secure URL parameter handling.

## Overview

The application includes comprehensive URL security features to protect sensitive data in URLs:

1. **ID Obfuscation**: Convert sequential IDs to non-guessable hashes
2. **URL Encryption**: Encrypt sensitive values in URLs
3. **URL Sanitization**: Remove dangerous patterns and characters
4. **URL Validation**: Validate URL formats and parameters
5. **Secure Tokens**: Create time-limited secure links

## Features

### 1. ID Obfuscation (Hashids)

Obfuscates numeric IDs to prevent enumeration attacks and hide sequential patterns.

**Example:**
```typescript
import { encodeId, decodeId } from './utils/urlEncoder';

// Encode ID
const hash = encodeId(123); // Returns: "aB3xY9zK"

// Decode hash
const id = decodeId("aB3xY9zK"); // Returns: 123
```

**Use Case:**
- Instead of `/api/invoices/123`, use `/api/invoices/aB3xY9zK`
- Prevents users from guessing other invoice IDs
- Still allows decoding to get the original ID

### 2. URL Encryption

Encrypts sensitive values using AES-256 encryption with URL-safe encoding.

**Example:**
```typescript
import { encryptUrlValue, decryptUrlValue } from './utils/urlEncoder';

// Encrypt
const encrypted = encryptUrlValue("sensitive-data");
// Returns: "iv:encrypted_data" (URL-safe base64)

// Decrypt
const decrypted = decryptUrlValue(encrypted);
// Returns: "sensitive-data"
```

**Use Case:**
- Encrypting tokens, passwords, or sensitive identifiers
- Creating secure one-time links
- Protecting data in query parameters

### 3. URL Sanitization

Automatically sanitizes URLs to prevent injection attacks.

**Features:**
- Removes null bytes
- Blocks javascript: and data: protocols
- Removes script tags
- Removes event handlers
- Limits URL length

**Automatic:** Applied via middleware to all requests

### 4. Secure Tokens

Create time-limited secure tokens for URLs (e.g., password reset links).

**Example:**
```typescript
import { createSecureToken, verifySecureToken } from './utils/urlEncoder';

// Create token (expires in 60 minutes)
const token = createSecureToken(
  { userId: 123, action: 'reset-password' },
  60
);

// Verify token
const data = verifySecureToken(token);
if (data) {
  // Token is valid and not expired
  console.log(data.userId, data.action);
} else {
  // Token is invalid or expired
}
```

## Usage Examples

### Encoding IDs in API Responses

```typescript
import { encodeId } from '../utils/urlEncoder';

// In your route handler
router.get('/invoices/:id', async (req, res) => {
  const invoice = await getInvoiceById(req.params.id);
  
  // Return with encoded ID
  res.json({
    ...invoice,
    id: encodeId(invoice.id), // Obfuscated ID
    url: `/api/invoices/${encodeId(invoice.id)}`,
  });
});
```

### Creating Secure Links

```typescript
import { createSecureLink } from '../utils/urlHelper';

// Create a password reset link
const resetLink = createSecureLink(
  'https://yourapp.com/reset-password',
  { userId: 123, email: 'user@example.com' },
  60 // Expires in 60 minutes
);
```

### Decoding IDs in Routes

The middleware automatically decodes obfuscated IDs. You can also decode manually:

```typescript
import { decodeId } from '../utils/urlEncoder';

router.get('/invoices/:id', async (req, res) => {
  // Middleware already decoded it, but you can also do:
  const id = decodeId(req.params.id) || parseInt(req.params.id, 10);
  
  if (!id) {
    return res.status(400).json({ error: 'Invalid ID' });
  }
  
  const invoice = await getInvoiceById(id);
  res.json(invoice);
});
```

## Middleware

The following middleware is automatically applied:

1. **detectSuspiciousUrls**: Logs suspicious URL patterns
2. **sanitizeUrlParams**: Sanitizes all URL parameters
3. **validateUrlParams**: Validates URL format in query parameters
4. **decodeUrlIds**: Automatically decodes obfuscated IDs

## Security Benefits

### 1. Prevents ID Enumeration
- Sequential IDs are obfuscated
- Users cannot guess other resource IDs
- Reduces information disclosure

### 2. Protects Sensitive Data
- Sensitive values can be encrypted in URLs
- Time-limited tokens prevent replay attacks
- URL-safe encoding ensures compatibility

### 3. Prevents Injection Attacks
- Automatic sanitization of URL parameters
- Blocks dangerous patterns and protocols
- Validates URL formats

### 4. Enhanced Privacy
- IDs don't reveal business information
- Encrypted tokens protect sensitive data
- Reduces information leakage

## Best Practices

### 1. Use ID Obfuscation for Public APIs
```typescript
// ✅ Good: Obfuscated ID
GET /api/invoices/aB3xY9zK

// ❌ Bad: Sequential ID
GET /api/invoices/123
```

### 2. Encrypt Sensitive Data
```typescript
// ✅ Good: Encrypted token
GET /api/reset-password?token=encrypted_token

// ❌ Bad: Plain text
GET /api/reset-password?userId=123&token=abc123
```

### 3. Use Time-Limited Tokens
```typescript
// ✅ Good: Expires in 1 hour
const token = createSecureToken(data, 60);

// ❌ Bad: No expiration
const token = encryptUrlValue(JSON.stringify(data));
```

### 4. Validate and Sanitize
```typescript
// ✅ Good: Automatic via middleware
// Middleware handles sanitization

// ❌ Bad: Trusting user input
const id = req.params.id; // Unsafe
```

## Configuration

URL encoding uses the same `JWT_SECRET` from your environment variables for encryption keys. Ensure this is set securely:

```env
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-min-32-chars
```

## Migration Guide

### Existing Routes

If you have existing routes using numeric IDs, they will continue to work. The middleware automatically:
1. Detects if an ID is obfuscated (not pure numeric)
2. Decodes it if it's a hash
3. Falls back to numeric parsing if it's a regular number

### Gradual Migration

You can gradually migrate to obfuscated IDs:

1. **Phase 1**: Start encoding IDs in API responses
2. **Phase 2**: Update frontend to use encoded IDs
3. **Phase 3**: Remove support for numeric IDs (optional)

## API Reference

### Encoding Functions

- `encodeId(id: number): string` - Obfuscate a single ID
- `encodeIds(ids: number[]): string` - Obfuscate multiple IDs
- `encryptUrlValue(value: string): string` - Encrypt a value
- `urlEncode(value: string): string` - URL-safe base64 encoding

### Decoding Functions

- `decodeId(hash: string): number | null` - Decode obfuscated ID
- `decodeIds(hash: string): number[]` - Decode multiple IDs
- `decryptUrlValue(encrypted: string): string` - Decrypt a value
- `urlDecode(encoded: string): string` - URL-safe base64 decoding

### Token Functions

- `createSecureToken(data: object, expiresInMinutes: number): string`
- `verifySecureToken(token: string): object | null`

### Helper Functions

- `createSecureUrl(baseUrl: string, id: number, useEncryption?: boolean): string`
- `createSecureLink(baseUrl: string, data: object, expiresInMinutes?: number): string`
- `sanitizeUrl(url: string): string`
- `isValidUrl(url: string): boolean`

## Troubleshooting

### "Invalid ID" Errors

If you're getting invalid ID errors:
1. Check if the ID is properly encoded
2. Verify the JWT_SECRET hasn't changed (affects encoding/decoding)
3. Ensure the middleware is applied

### Decoding Failures

If decoding fails:
1. Verify the hash format is correct
2. Check that JWT_SECRET matches between encoding and decoding
3. Ensure the hash hasn't been modified

### Token Expiration

If tokens expire too quickly:
1. Increase the `expiresInMinutes` parameter
2. Check server time synchronization
3. Verify token creation time

## Security Considerations

1. **JWT_SECRET**: Must be kept secret and consistent
2. **Token Expiration**: Set appropriate expiration times
3. **HTTPS**: Always use HTTPS in production for encrypted URLs
4. **Rate Limiting**: Combine with rate limiting for additional security
5. **Logging**: Monitor suspicious URL patterns

## Examples in Routes

See the following files for implementation examples:
- `backend/src/utils/urlEncoder.ts` - Core utilities
- `backend/src/utils/urlHelper.ts` - Helper functions
- `backend/src/middleware/urlSecurity.ts` - Security middleware

