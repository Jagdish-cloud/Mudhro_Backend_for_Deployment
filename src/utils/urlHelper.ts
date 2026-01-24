/**
 * URL Helper Utilities
 * Helper functions for working with URLs in responses
 */

import { encodeId, encryptUrlValue, createSecureToken } from './urlEncoder';

/**
 * Create a secure URL with encoded ID
 */
export const createSecureUrl = (baseUrl: string, id: number, useEncryption: boolean = false): string => {
  const encodedId = useEncryption ? encryptUrlValue(id.toString()) : encodeId(id);
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}id=${encodedId}`;
};

/**
 * Create pagination URLs with encoded parameters
 */
export const createPaginationUrls = (
  baseUrl: string,
  currentPage: number,
  totalPages: number,
  pageSize: number
): {
  first: string;
  prev: string | null;
  next: string | null;
  last: string;
} => {
  const first = `${baseUrl}?page=1&limit=${pageSize}`;
  const last = `${baseUrl}?page=${totalPages}&limit=${pageSize}`;
  const prev = currentPage > 1 ? `${baseUrl}?page=${currentPage - 1}&limit=${pageSize}` : null;
  const next = currentPage < totalPages ? `${baseUrl}?page=${currentPage + 1}&limit=${pageSize}` : null;

  return { first, prev, next, last };
};

/**
 * Add encoded query parameters to URL
 */
export const addQueryParams = (url: string, params: Record<string, string | number | boolean>): string => {
  const urlObj = new URL(url, 'http://localhost'); // Base URL for parsing
  for (const [key, value] of Object.entries(params)) {
    urlObj.searchParams.set(key, String(value));
  }
  return urlObj.pathname + urlObj.search;
};

/**
 * Create a time-limited secure link (e.g., for password reset)
 */
export const createSecureLink = (
  baseUrl: string,
  data: Record<string, any>,
  expiresInMinutes: number = 60
): string => {
  const token = createSecureToken(data, expiresInMinutes);
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}token=${token}`;
};

