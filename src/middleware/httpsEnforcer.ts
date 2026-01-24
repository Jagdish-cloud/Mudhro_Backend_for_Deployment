import { Request, Response, NextFunction } from 'express';
import { isHttpsRequired } from '../config/security';

/**
 * Middleware to enforce HTTPS in production
 */
export const enforceHttps = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!isHttpsRequired()) {
    return next();
  }

  // Check if request is secure
  const isSecure =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    req.headers['x-forwarded-ssl'] === 'on';

  if (!isSecure) {
    res.status(403).json({
      success: false,
      message: 'HTTPS is required for this application',
    });
    return;
  }

  next();
};

