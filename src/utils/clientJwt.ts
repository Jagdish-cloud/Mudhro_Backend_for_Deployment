import jwt from 'jsonwebtoken';

const CLIENT_JWT_SECRET = process.env.CLIENT_JWT_SECRET || process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const CLIENT_JWT_EXPIRES_IN = process.env.CLIENT_JWT_EXPIRES_IN || '8h';

export interface ClientTokenPayload {
  clientId: number;
  email: string;
  type: 'CLIENT';
  scope: ['INVOICE_READ'];
}

/**
 * Generate a client JWT token
 */
export const generateClientToken = (clientId: number, email: string): string => {
  const payload: ClientTokenPayload = {
    clientId,
    email,
    type: 'CLIENT',
    scope: ['INVOICE_READ'],
  };

  return jwt.sign(payload, CLIENT_JWT_SECRET, {
    expiresIn: CLIENT_JWT_EXPIRES_IN,
  } as jwt.SignOptions);
};

/**
 * Verify and decode a client JWT token
 * Throws error if token is invalid, expired, or not a client token
 */
export const verifyClientToken = (token: string): ClientTokenPayload => {
  try {
    const decoded = jwt.verify(token, CLIENT_JWT_SECRET) as any;
    
    // Ensure this is a client token
    if (decoded.type !== 'CLIENT') {
      throw new Error('Token is not a client token');
    }

    // Ensure required fields are present
    if (!decoded.clientId || !decoded.email || !decoded.scope) {
      throw new Error('Invalid client token payload');
    }

    return decoded as ClientTokenPayload;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid client token');
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Client token has expired');
    }
    throw error;
  }
};

/**
 * Get client token expiration time
 */
export const getClientTokenExpiration = (): Date => {
  const expiresIn = CLIENT_JWT_EXPIRES_IN;
  const now = new Date();
  
  if (expiresIn.endsWith('h')) {
    const hours = parseInt(expiresIn.slice(0, -1), 10);
    return new Date(now.getTime() + hours * 60 * 60 * 1000);
  } else if (expiresIn.endsWith('d')) {
    const days = parseInt(expiresIn.slice(0, -1), 10);
    return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  } else if (expiresIn.endsWith('m')) {
    const minutes = parseInt(expiresIn.slice(0, -1), 10);
    return new Date(now.getTime() + minutes * 60 * 1000);
  }
  
  // Default to 8 hours
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
};
