import { Request, Response, NextFunction } from 'express';
import { verifyClientToken } from '../utils/clientJwt';

export interface ClientAuthRequest extends Request {
  client?: {
    clientId: number;
    email: string;
  };
}

/**
 * Middleware to authenticate client JWT tokens
 * Ensures token is a CLIENT type token and extracts client information
 */
export const authenticateClientToken = (
  req: ClientAuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Access token is required',
        error: 'No token provided',
      });
      return;
    }

    // Verify token and ensure it's a client token
    const decoded = verifyClientToken(token);
    
    // Attach client info to request
    req.client = {
      clientId: decoded.clientId,
      email: decoded.email,
    };

    next();
  } catch (error) {
    res.status(403).json({
      success: false,
      message: 'Invalid or expired client token',
      error: error instanceof Error ? error.message : 'Authentication failed',
    });
  }
};
