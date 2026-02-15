import express from 'express';
import {
  validateClientPassword,
  generateOTP,
  verifyOTP,
  updateLastLogin,
  registerClientAuth,
} from '../services/clientAuthService';
import { generateClientToken } from '../utils/clientJwt';
import { buildOTPEmail } from '../utils/clientEmailTemplates';
import { sendMail } from '../services/mailer';
import { AppError } from '../middleware/errorHandler';
import {
  clientLoginLimiter,
  clientOtpGenerationLimiter,
  clientOtpVerificationLimiter,
  strictRateLimiter,
} from '../middleware/security';

const router = express.Router();

/**
 * @route   POST /client-portal/auth/register
 * @desc    Register a new client portal account
 * @access  Public
 */
router.post(
  '/register',
  strictRateLimiter, // 10 requests per hour per IP
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required',
        });
      }

      // Validate password strength
      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 8 characters long',
        });
      }

      // Register client
      const clientInfo = await registerClientAuth(email, password);

      res.status(201).json({
        success: true,
        message: 'Account created successfully. You can now login.',
        client: {
          email: clientInfo.email,
          fullName: clientInfo.fullName,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /client-portal/auth/login
 * @desc    Client login - validate password and send OTP
 * @access  Public
 */
router.post(
  '/login',
  clientLoginLimiter,
  clientOtpGenerationLimiter,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required',
        });
      }

      // Validate password
      const clientInfo = await validateClientPassword(email, password);

      // Generate OTP
      const otp = await generateOTP(clientInfo.clientId, clientInfo.email);

      // Send OTP email
      const emailTemplate = buildOTPEmail({
        otp,
        clientName: clientInfo.fullName,
      });

      try {
        await sendMail({
          to: clientInfo.email,
          subject: emailTemplate.subject,
          html: emailTemplate.html,
          text: emailTemplate.text,
        });
      } catch (emailError: any) {
        console.error('[Client Auth] Failed to send OTP email:', emailError);
        // Don't fail the request, but log the error
        // In production, you might want to fail here
      }

      res.status(200).json({
        success: true,
        message: 'OTP sent to your email',
        otpRequired: true,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /client-portal/auth/verify-otp
 * @desc    Verify OTP and return JWT token
 * @access  Public
 */
router.post(
  '/verify-otp',
  clientOtpVerificationLimiter,
  async (req, res, next) => {
    try {
      const { email, otp } = req.body;

      if (!email || !otp) {
        return res.status(400).json({
          success: false,
          message: 'Email and OTP are required',
        });
      }

      // Verify OTP
      const clientInfo = await verifyOTP(email, otp);

      // Update last login
      await updateLastLogin(clientInfo.clientId);

      // Generate JWT token
      const token = generateClientToken(clientInfo.clientId, clientInfo.email);

      res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
