import express from 'express';
import {
  getClientInvoices,
  getClientInvoiceById,
  getClientInvoicePdf,
  getClientInvoiceItems,
  getClientInfo,
} from '../services/clientInvoiceService';
import { authenticateClientToken, ClientAuthRequest } from '../middleware/clientAuth';
import { AppError } from '../middleware/errorHandler';

const router = express.Router();

/**
 * @route   GET /client-portal/invoices/info
 * @desc    Get client information for the authenticated client
 * @access  Private (Client)
 */
router.get('/info', authenticateClientToken, async (req: ClientAuthRequest, res, next) => {
  try {
    if (!req.client) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const clientInfo = await getClientInfo(req.client.clientId);

    res.status(200).json({
      success: true,
      message: 'Client information retrieved successfully',
      client: clientInfo,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /client-portal/invoices
 * @desc    Get all invoices for the authenticated client
 * @access  Private (Client)
 */
router.get('/', authenticateClientToken, async (req: ClientAuthRequest, res, next) => {
  try {
    if (!req.client) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const invoices = await getClientInvoices(req.client.clientId);

    res.status(200).json({
      success: true,
      message: 'Invoices retrieved successfully',
      invoices,
      count: invoices.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /client-portal/invoices/:id/items
 * @desc    Get invoice items for a specific invoice (client-scoped)
 * @access  Private (Client)
 * @note    Must be defined before /:id route to avoid route conflicts
 */
router.get('/:id/items', authenticateClientToken, async (req: ClientAuthRequest, res, next) => {
  try {
    if (!req.client) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const invoiceId = parseInt(req.params.id, 10);
    if (isNaN(invoiceId) || invoiceId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invoice ID',
      });
    }

    const items = await getClientInvoiceItems(invoiceId, req.client.clientId);

    res.status(200).json({
      success: true,
      message: 'Invoice items retrieved successfully',
      invoiceItems: items,
      count: items.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /client-portal/invoices/:id/pdf
 * @desc    Download invoice PDF for the authenticated client
 * @access  Private (Client)
 * @note    Must be defined before /:id route to avoid route conflicts
 */
router.get('/:id/pdf', authenticateClientToken, async (req: ClientAuthRequest, res, next) => {
  try {
    if (!req.client) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const invoiceId = parseInt(req.params.id, 10);
    if (isNaN(invoiceId) || invoiceId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invoice ID',
      });
    }

    const pdfData = await getClientInvoicePdf(invoiceId, req.client.clientId);

    res.setHeader('Content-Type', pdfData.contentType);
    res.setHeader('Content-Length', pdfData.buffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(pdfData.fileName)}"`);
    res.send(pdfData.buffer);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /client-portal/invoices/:id
 * @desc    Get a specific invoice by ID for the authenticated client
 * @access  Private (Client)
 * @note    Must be defined after /:id/items and /:id/pdf routes
 */
router.get('/:id', authenticateClientToken, async (req: ClientAuthRequest, res, next) => {
  try {
    if (!req.client) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const invoiceId = parseInt(req.params.id, 10);
    if (isNaN(invoiceId) || invoiceId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invoice ID',
      });
    }

    const invoice = await getClientInvoiceById(invoiceId, req.client.clientId);

    res.status(200).json({
      success: true,
      message: 'Invoice retrieved successfully',
      invoice,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
