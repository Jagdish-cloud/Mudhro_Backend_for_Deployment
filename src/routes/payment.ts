import express from 'express';
import {
  createPayment,
  getPaymentsByInvoiceId,
  getPaymentsByUserId,
  getPaymentById,
  updatePayment,
} from '../services/paymentService';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { decodeId, urlDecode } from '../utils/urlEncoder';

const router = express.Router();

/**
 * Helper function to decode an invoice ID from request
 * Handles both numeric IDs and encoded IDs (Hashids or base64url)
 */
const decodeInvoiceId = (id: string | number): number | null => {
  // If it's already a number, return it
  if (typeof id === 'number') {
    return id;
  }
  
  if (!id || typeof id !== 'string') {
    return null;
  }
  
  // If it's a numeric string, return it
  if (/^\d+$/.test(id)) {
    return parseInt(id, 10);
  }
  
  // Try Hashids decoding first
  let decoded = decodeId(id);
  
  // If Hashids decoding fails, try base64url decoding (frontend encoding)
  if (decoded === null) {
    try {
      const base64Decoded = urlDecode(id);
      const numericId = parseInt(base64Decoded, 10);
      if (!isNaN(numericId) && numericId > 0) {
        decoded = numericId;
      }
    } catch (error) {
      // Decoding failed, return null
    }
  }
  
  return decoded;
};

/**
 * @route   POST /api/payments
 * @desc    Create a payment record (mark invoice as paid)
 * @access  Private
 */
router.post(
  '/',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const { invoiceId, amountReceived, paymentGatewayFee, tdsDeducted, otherDeduction, notes, paymentDate } = req.body;

      // Validate required fields
      if (!invoiceId || amountReceived === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Invoice ID and amount received are required',
        });
      }

      // Decode invoice ID if it's encoded
      const decodedInvoiceId = decodeInvoiceId(invoiceId);
      if (!decodedInvoiceId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid invoice ID',
        });
      }

      const paymentData = {
        invoiceId: decodedInvoiceId,
        amountReceived: parseFloat(amountReceived),
        paymentGatewayFee: paymentGatewayFee !== undefined ? parseFloat(paymentGatewayFee) : undefined,
        tdsDeducted: tdsDeducted !== undefined ? parseFloat(tdsDeducted) : undefined,
        otherDeduction: otherDeduction !== undefined ? parseFloat(otherDeduction) : undefined,
        notes,
        paymentDate,
      };

      const payment = await createPayment(req.user.userId, paymentData);

      res.status(201).json({
        success: true,
        message: 'Payment recorded successfully',
        payment,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/payments/invoice/:id
 * @desc    Get all payments for a specific invoice
 * @access  Private
 */
router.get(
  '/invoice/:id',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const decodedInvoiceId = decodeInvoiceId(req.params.id);
      if (!decodedInvoiceId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid invoice ID',
        });
      }

      const payments = await getPaymentsByInvoiceId(decodedInvoiceId, req.user.userId);

      res.status(200).json({
        success: true,
        payments,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/payments
 * @desc    Get all payments for the authenticated user
 * @access  Private
 */
router.get(
  '/',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const payments = await getPaymentsByUserId(req.user.userId);

      res.status(200).json({
        success: true,
        payments,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/payments/:id
 * @desc    Get a specific payment by ID
 * @access  Private
 */
router.get(
  '/:id',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const decodedPaymentId = decodeInvoiceId(req.params.id);
      if (!decodedPaymentId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid payment ID',
        });
      }

      const payment = await getPaymentById(decodedPaymentId, req.user.userId);

      res.status(200).json({
        success: true,
        payment,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/payments/:id
 * @desc    Update an existing payment record
 * @access  Private
 */
router.put(
  '/:id',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const decodedPaymentId = decodeInvoiceId(req.params.id);
      if (!decodedPaymentId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid payment ID',
        });
      }

      const { amountReceived, paymentGatewayFee, tdsDeducted, otherDeduction, notes, paymentDate } = req.body;

      const updateData = {
        amountReceived: amountReceived !== undefined ? parseFloat(amountReceived) : undefined,
        paymentGatewayFee: paymentGatewayFee !== undefined ? parseFloat(paymentGatewayFee) : undefined,
        tdsDeducted: tdsDeducted !== undefined ? parseFloat(tdsDeducted) : undefined,
        otherDeduction: otherDeduction !== undefined ? parseFloat(otherDeduction) : undefined,
        notes,
        paymentDate,
      };

      const payment = await updatePayment(decodedPaymentId, req.user.userId, updateData);

      res.status(200).json({
        success: true,
        message: 'Payment updated successfully',
        payment,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

