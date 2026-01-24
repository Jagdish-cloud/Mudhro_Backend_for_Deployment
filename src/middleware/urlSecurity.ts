import { Request, Response, NextFunction } from 'express';
import { sanitizeUrl, isValidUrl, decodeId, urlDecode } from '../utils/urlEncoder';

/**
 * URL Security Middleware
 * Sanitizes and validates URLs and parameters
 */

/**
 * Sanitize URL parameters
 */
export const sanitizeUrlParams = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  // Sanitize query parameter VALUES (not keys, and preserve numeric/valid values)
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') {
        // Don't sanitize numeric values or common query parameter values
        // Only sanitize if it looks like it might contain malicious content
        if (!/^\d+$/.test(value) && (value.includes('<') || value.includes('javascript:') || value.includes('on'))) {
          const sanitized = sanitizeUrl(value);
          if (sanitized !== value) {
            console.warn('[Security] Sanitized query parameter value:', { key, original: value, sanitized });
            req.query[key] = sanitized;
          }
        }
      }
    }
  }

  // Sanitize URL parameters
  if (req.params) {
    for (const [key, value] of Object.entries(req.params)) {
      if (typeof value === 'string') {
        req.params[key] = sanitizeUrl(value);
      }
    }
  }

  // Sanitize the original URL
  if (req.originalUrl) {
    const sanitized = sanitizeUrl(req.originalUrl);
    if (sanitized !== req.originalUrl) {
      console.warn('[Security] Sanitized URL:', {
        original: req.originalUrl,
        sanitized,
        ip: req.ip,
      });
    }
  }

  next();
};

/**
 * Validate URL format in query parameters
 */
export const validateUrlParams = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Check for URL parameters that should be validated
  const urlParams = ['redirect', 'callback', 'returnUrl', 'next'];
  
  for (const param of urlParams) {
    const value = req.query[param];
    if (value && typeof value === 'string') {
      if (!isValidUrl(value)) {
        res.status(400).json({
          success: false,
          message: `Invalid URL format in parameter: ${param}`,
        });
        return;
      }
    }
  }

  next();
};

/**
 * Decode obfuscated IDs in URL parameters
 * Automatically decodes hash IDs to numeric IDs
 */
/**
 * Helper function to decode an ID value
 */
const decodeIdValue = (value: string): number | null => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  // If it's already a number, return it
  if (/^\d+$/.test(value)) {
    return parseInt(value, 10);
  }

  // Try Hashids decoding first
  let decoded = decodeId(value);
  
  // If Hashids decoding fails, try base64url decoding (frontend encoding)
  if (decoded === null) {
    try {
      const base64Decoded = urlDecode(value);
      const numericId = parseInt(base64Decoded, 10);
      if (!isNaN(numericId) && numericId > 0) {
        decoded = numericId;
      }
    } catch (error) {
      console.warn(`[URL Security] Failed to decode ID "${value}":`, error);
    }
  }
  
  return decoded;
};

export const decodeUrlIds = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  // Common ID parameter names (including invoiceId and expenseId for item routes)
  const idParams = ['id', 'userId', 'invoiceId', 'expenseId', 'clientId', 'itemId', 'vendorId', 'serviceId'];
  
  // Note: We can't modify req.path or req.url as they are read-only in Express
  // Instead, we decode IDs in the route handlers themselves (see invoice.ts, expense.ts, etc.)
  // This middleware only handles query parameters and already-parsed route params
  
  // Decode params (these are populated after route matching)
  if (req.params && Object.keys(req.params).length > 0) {
    for (const param of idParams) {
      const value = req.params[param];
      if (value && typeof value === 'string' && !/^\d+$/.test(value)) {
        console.log(`[URL Security] Processing param "${param}": "${value}"`);
        const decoded = decodeIdValue(value);
        
        if (decoded !== null) {
          console.log(`[URL Security] Decoded param "${param}": "${value}" -> "${decoded}"`);
          req.params[param] = decoded.toString();
        } else {
          console.warn(`[URL Security] Could not decode param "${param}" with value "${value}". Keeping original.`);
        }
      }
    }
  }

  // Decode query params
  if (req.query) {
    for (const param of idParams) {
      const value = req.query[param];
      if (value && typeof value === 'string') {
        console.log(`[URL Security] Processing query param "${param}": "${value}"`);
        if (!/^\d+$/.test(value)) {
          // Try Hashids decoding first
          let decoded = decodeId(value);
          console.log(`[URL Security] Hashids decode result for "${value}":`, decoded);
          
          // If Hashids decoding fails, try base64url decoding (frontend encoding)
          if (decoded === null) {
            try {
              const base64Decoded = urlDecode(value);
              const numericId = parseInt(base64Decoded, 10);
              console.log(`[URL Security] Base64url decode result for "${value}": "${base64Decoded}" -> ${numericId}`);
              if (!isNaN(numericId) && numericId > 0) {
                decoded = numericId;
              }
            } catch (error) {
              // If both fail, keep original value
              console.warn(`[URL Security] Failed to decode query param ID "${value}":`, error);
            }
          }
          
          if (decoded !== null) {
            console.log(`[URL Security] Decoded query param "${param}": "${value}" -> "${decoded}"`);
            req.query[param] = decoded.toString();
          } else {
            console.warn(`[URL Security] Could not decode query param "${param}" with value "${value}". Keeping original.`);
          }
        } else {
          console.log(`[URL Security] Query param "${param}" is already numeric: "${value}"`);
        }
      }
    }
  }

  next();
};

/**
 * Log suspicious URL patterns
 */
export const detectSuspiciousUrls = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const suspiciousPatterns = [
    /\.\./, // Path traversal
    /<script/i, // Script injection
    /javascript:/i, // JavaScript protocol
    /eval\(/i, // Code execution
    /union.*select/i, // SQL injection
  ];

  // Event handler pattern - only check in path, not query string
  const eventHandlerPattern = /on\w+\s*=/i;
  
  const fullUrl = req.originalUrl || req.url;
  const [path, queryString] = fullUrl.split('?');
  
  // Check suspicious patterns in full URL
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(fullUrl)) {
      console.warn('[Security] Suspicious URL pattern detected:', {
        url: fullUrl,
        pattern: pattern.toString(),
        ip: req.ip,
        userAgent: req.get('user-agent'),
        timestamp: new Date().toISOString(),
      });
      break;
    }
  }
  
  // Check event handlers only in path (not query string) to avoid false positives like "month="
  if (eventHandlerPattern.test(path)) {
    console.warn('[Security] Suspicious URL pattern detected (event handler in path):', {
      url: fullUrl,
      path,
      pattern: eventHandlerPattern.toString(),
      ip: req.ip,
      userAgent: req.get('user-agent'),
      timestamp: new Date().toISOString(),
    });
  }

  next();
};

