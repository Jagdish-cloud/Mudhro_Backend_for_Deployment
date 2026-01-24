import crypto from 'crypto';
import Hashids from 'hashids';
import { getSecurityConfig } from '../config/security';

const securityConfig = getSecurityConfig();

/**
 * URL Encoding/Encryption Utilities
 * Provides secure encoding and encryption for URL parameters
 */

// Initialize Hashids for ID obfuscation (non-reversible but deterministic)
const hashids = new Hashids(securityConfig.jwtSecret, 8, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890');

/**
 * Encrypt a value for use in URLs
 * Uses AES-256 encryption with URL-safe encoding
 */
export const encryptUrlValue = (value: string): string => {
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(securityConfig.jwtSecret, 'salt', 32);
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(value, 'utf8', 'base64url');
  encrypted += cipher.final('base64url');
  
  // Combine IV and encrypted data, separated by ':'
  const result = `${iv.toString('base64url')}:${encrypted}`;
  return result;
};

/**
 * Decrypt a URL-encrypted value
 */
export const decryptUrlValue = (encryptedValue: string): string => {
  try {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(securityConfig.jwtSecret, 'salt', 32);
    
    const parts = encryptedValue.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted format');
    }
    
    const iv = Buffer.from(parts[0], 'base64url');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'base64url', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error('Failed to decrypt URL value');
  }
};

/**
 * Encode an ID to an obfuscated hash (non-reversible, but deterministic)
 * Useful for hiding sequential IDs in URLs
 */
export const encodeId = (id: number): string => {
  return hashids.encode(id);
};

/**
 * Decode an obfuscated ID hash back to the original ID
 */
export const decodeId = (hash: string): number | null => {
  const decoded = hashids.decode(hash);
  if (decoded.length === 0) {
    return null;
  }
  return decoded[0] as number;
};

/**
 * Encode multiple IDs into a single hash
 */
export const encodeIds = (ids: number[]): string => {
  return hashids.encode(...ids);
};

/**
 * Decode a hash back to multiple IDs
 */
export const decodeIds = (hash: string): number[] => {
  return hashids.decode(hash) as number[];
};

/**
 * URL-safe base64 encoding
 */
export const urlEncode = (value: string): string => {
  return Buffer.from(value, 'utf8')
    .toString('base64url')
    .replace(/=/g, '');
};

/**
 * URL-safe base64 decoding
 */
export const urlDecode = (encoded: string): string => {
  if (!encoded || typeof encoded !== 'string') {
    throw new Error('Invalid encoded string');
  }
  
  // Replace base64url characters with base64 characters
  let padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
  
  // Add padding if needed
  const padding = (4 - (padded.length % 4)) % 4;
  padded = padded + '='.repeat(padding);
  
  try {
    return Buffer.from(padded, 'base64').toString('utf8');
  } catch (error) {
    throw new Error(`Failed to decode base64url: ${error}`);
  }
};

/**
 * Encode query parameters securely
 */
export const encodeQueryParams = (params: Record<string, string | number | boolean>): string => {
  const encoded: string[] = [];
  
  for (const [key, value] of Object.entries(params)) {
    const encodedKey = encodeURIComponent(key);
    const encodedValue = encodeURIComponent(String(value));
    encoded.push(`${encodedKey}=${encodedValue}`);
  }
  
  return encoded.join('&');
};

/**
 * Decode and validate query parameters
 */
export const decodeQueryParams = (queryString: string): Record<string, string> => {
  const params: Record<string, string> = {};
  
  if (!queryString) {
    return params;
  }
  
  const pairs = queryString.split('&');
  
  for (const pair of pairs) {
    const [key, value] = pair.split('=').map(decodeURIComponent);
    if (key && value) {
      params[key] = value;
    }
  }
  
  return params;
};

/**
 * Sanitize URL to prevent injection attacks
 */
export const sanitizeUrl = (url: string): string => {
  // Remove dangerous characters and patterns
  let sanitized = url;
  
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');
  
  // Remove javascript: and data: protocols
  sanitized = sanitized.replace(/^(javascript|data|vbscript):/i, '');
  
  // Remove script tags
  sanitized = sanitized.replace(/<script[^>]*>.*?<\/script>/gi, '');
  
  // Remove event handlers (only match common event handler names, not query params like "month=")
  // Match: onclick=, onerror=, onload=, etc. but NOT month=, money=, etc.
  // Only match in HTML attribute context, not in query strings
  const eventHandlers = [
    'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover', 'onmouseout',
    'onmousemove', 'onmouseenter', 'onmouseleave', 'onkeydown', 'onkeyup', 'onkeypress',
    'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset', 'onselect', 'onload', 'onunload',
    'onerror', 'onabort', 'onresize', 'onscroll', 'oncontextmenu', 'ondrag', 'ondragend',
    'ondragenter', 'ondragleave', 'ondragover', 'ondragstart', 'ondrop'
  ];
  
  // Split URL into path and query string
  const [path, queryString] = sanitized.split('?');
  let sanitizedPath = path;
  const sanitizedQuery = queryString || '';
  
  // Only sanitize event handlers in the path portion, not in query parameters
  // This prevents false positives like "month=" being treated as an event handler
  for (const handler of eventHandlers) {
    const regex = new RegExp(`${handler}\\s*=`, 'gi');
    sanitizedPath = sanitizedPath.replace(regex, '');
  }
  
  // Reconstruct URL
  sanitized = queryString ? `${sanitizedPath}?${sanitizedQuery}` : sanitizedPath;
  
  // Limit length
  if (sanitized.length > 2048) {
    sanitized = sanitized.substring(0, 2048);
  }
  
  return sanitized;
};

/**
 * Validate URL format
 */
export const isValidUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    // Only allow http and https protocols
    return ['http:', 'https:'].includes(urlObj.protocol);
  } catch {
    return false;
  }
};

/**
 * Create a secure token for URL parameters (time-limited)
 */
export const createSecureToken = (data: Record<string, any>, expiresInMinutes: number = 60): string => {
  const payload = {
    data,
    expires: Date.now() + (expiresInMinutes * 60 * 1000),
  };
  
  const json = JSON.stringify(payload);
  return encryptUrlValue(json);
};

/**
 * Verify and decode a secure token
 */
export const verifySecureToken = (token: string): Record<string, any> | null => {
  try {
    const decrypted = decryptUrlValue(token);
    const payload = JSON.parse(decrypted);
    
    // Check expiration
    if (payload.expires && Date.now() > payload.expires) {
      return null; // Token expired
    }
    
    return payload.data;
  } catch {
    return null; // Invalid token
  }
};

