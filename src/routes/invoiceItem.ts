import express from 'express';
import {
  createInvoiceItem,
  getInvoiceItemsByInvoiceId,
  getInvoiceItemById,
  updateInvoiceItem,
  deleteInvoiceItem,
} from '../services/invoiceItemService';
import {
  validateCreateInvoiceItem,
  validateUpdateInvoiceItem,
} from '../middleware/invoiceItemValidator';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { decodeId, urlDecode } from '../utils/urlEncoder';

const router = express.Router();

/**
 * Helper function to decode an invoice ID from req.params
 * Handles both numeric IDs and encoded IDs (Hashids or base64url)
 */
const decodeInvoiceId = (paramId: string): number | null => {
  if (!paramId || typeof paramId !== 'string') {
    return null;
  }
  
  // If it's already a number, return it
  if (/^\d+$/.test(paramId)) {
    return parseInt(paramId, 10);
  }
  
  // Try Hashids decoding first
  let decoded = decodeId(paramId);
  
  // If Hashids decoding fails, try base64url decoding (frontend encoding)
  if (decoded === null) {
    try {
      const base64Decoded = urlDecode(paramId);
      const numericId = parseInt(base64Decoded, 10);
      if (!isNaN(numericId) && numericId > 0) {
        decoded = numericId;
        console.log(`[InvoiceItem Route] Successfully decoded base64url: ${paramId} -> ${decoded}`);
      }
    } catch (error) {
      console.warn(`[InvoiceItem Route] Failed to decode ID "${paramId}":`, error);
    }
  } else {
    console.log(`[InvoiceItem Route] Successfully decoded Hashids: ${paramId} -> ${decoded}`);
  }
  
  return decoded;
};

/**
 * Helper function to decode an invoice item ID from req.params
 * Handles both numeric IDs and encoded IDs (Hashids or base64url)
 */
const decodeInvoiceItemId = (paramId: string): number | null => {
  if (!paramId || typeof paramId !== 'string') {
    return null;
  }
  
  // If it's already a number, return it
  if (/^\d+$/.test(paramId)) {
    return parseInt(paramId, 10);
  }
  
  // Try Hashids decoding first
  let decoded = decodeId(paramId);
  
  // If Hashids decoding fails, try base64url decoding (frontend encoding)
  if (decoded === null) {
    try {
      const base64Decoded = urlDecode(paramId);
      const numericId = parseInt(base64Decoded, 10);
      if (!isNaN(numericId) && numericId > 0) {
        decoded = numericId;
        console.log(`[InvoiceItem Route] Successfully decoded base64url: ${paramId} -> ${decoded}`);
      }
    } catch (error) {
      console.warn(`[InvoiceItem Route] Failed to decode ID "${paramId}":`, error);
    }
  } else {
    console.log(`[InvoiceItem Route] Successfully decoded Hashids: ${paramId} -> ${decoded}`);
  }
  
  return decoded;
};

/**
 * @route   POST /api/invoices/:invoiceId/items
 * @desc    Add an item to an invoice
 * @access  Private
 */
router.post(
  '/:invoiceId/items',
  authenticateToken,
  validateCreateInvoiceItem,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const invoiceId = decodeInvoiceId(req.params.invoiceId);
      if (invoiceId === null || invoiceId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid invoice ID',
        });
      }

      const invoiceItemData = {
        ...req.body,
        invoiceId,
        userId: req.user.userId,
      };

      const invoiceItem = await createInvoiceItem(invoiceItemData);

      res.status(201).json({
        success: true,
        message: 'Invoice item added successfully',
        invoiceItem,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/invoices/:invoiceId/items
 * @desc    Get all items for an invoice
 * @access  Private
 */
router.get('/:invoiceId/items', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const invoiceId = decodeInvoiceId(req.params.invoiceId);
    if (invoiceId === null || invoiceId <= 0) {
      console.warn(`[InvoiceItem Route] Invalid invoice ID: ${req.params.invoiceId}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid invoice ID',
      });
    }

    console.log(`[InvoiceItem Route] Fetching invoice items for invoice ${invoiceId}, user ${req.user.userId}`);
    const invoiceItems = await getInvoiceItemsByInvoiceId(invoiceId, req.user.userId);
    console.log(`[InvoiceItem Route] Found ${invoiceItems.length} invoice items`);

    res.status(200).json({
      success: true,
      message: 'Invoice items retrieved successfully',
      invoiceItems,
      count: invoiceItems.length,
    });
  } catch (error) {
    next(error);
  }
});

// Separate router for standalone invoice item operations
export const invoiceItemStandaloneRouter = express.Router();

/**
 * @route   GET /api/invoice-items/:id
 * @desc    Get a specific invoice item by ID
 * @access  Private
 */
invoiceItemStandaloneRouter.get('/:id', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const invoiceItemId = decodeInvoiceItemId(req.params.id);
    if (invoiceItemId === null || invoiceItemId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invoice item ID',
      });
    }

    const invoiceItem = await getInvoiceItemById(invoiceItemId, req.user.userId);

    res.status(200).json({
      success: true,
      invoiceItem,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/invoice-items/:id
 * @desc    Update an invoice item
 * @access  Private
 */
invoiceItemStandaloneRouter.put(
  '/:id',
  authenticateToken,
  validateUpdateInvoiceItem,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const invoiceItemId = decodeInvoiceItemId(req.params.id);
      if (invoiceItemId === null || invoiceItemId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid invoice item ID',
        });
      }

      const invoiceItem = await updateInvoiceItem(invoiceItemId, req.user.userId, req.body);

      res.status(200).json({
        success: true,
        message: 'Invoice item updated successfully',
        invoiceItem,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/invoice-items/:id
 * @desc    Delete an invoice item
 * @access  Private
 */
invoiceItemStandaloneRouter.delete('/:id', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const invoiceItemId = decodeInvoiceItemId(req.params.id);
    if (invoiceItemId === null || invoiceItemId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invoice item ID',
      });
    }

    await deleteInvoiceItem(invoiceItemId, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Invoice item deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
