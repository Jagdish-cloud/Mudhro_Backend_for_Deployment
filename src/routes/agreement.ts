import express from 'express';
import {
  createAgreement,
  getAgreementById,
  getAgreementByProjectId,
  updateAgreement,
  deleteAgreement,
  validateSignatureToken,
  submitClientSignature,
  sendAgreementToClients,
} from '../services/agreementService';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { decodeId, urlDecode } from '../utils/urlEncoder';

const router = express.Router();

/**
 * Helper function to decode an agreement ID from req.params
 */
const decodeAgreementId = (paramId: string): number | null => {
  if (!paramId || typeof paramId !== 'string') {
    return null;
  }
  
  if (/^\d+$/.test(paramId)) {
    return parseInt(paramId, 10);
  }
  
  let decoded = decodeId(paramId);
  
  if (decoded === null) {
    try {
      const base64Decoded = urlDecode(paramId);
      const numericId = parseInt(base64Decoded, 10);
      if (!isNaN(numericId) && numericId > 0) {
        decoded = numericId;
      }
    } catch (error) {
      console.warn(`[Agreement Route] Failed to decode ID "${paramId}":`, error);
    }
  }
  
  return decoded;
};

/**
 * @route   POST /api/agreements
 * @desc    Create a new agreement
 * @access  Private
 */
router.post('/', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const {
      projectId,
      serviceProviderName,
      agreementDate,
      serviceType,
      startDate,
      endDate,
      duration,
      durationUnit,
      numberOfRevisions,
      jurisdiction,
      deliverables,
      paymentStructure,
      paymentMethod,
      paymentMilestones,
      serviceProviderSignature,
    } = req.body;

    if (!projectId || !serviceProviderName || !agreementDate || !serviceType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
      });
    }

    const agreementData = {
      projectId: parseInt(projectId, 10),
      userId: req.user.userId,
      serviceProviderName,
      agreementDate,
      serviceType,
      startDate,
      endDate,
      duration: duration ? parseInt(duration, 10) : undefined,
      durationUnit,
      numberOfRevisions: numberOfRevisions || 0,
      jurisdiction,
      deliverables: deliverables || [],
      paymentStructure,
      paymentMethod,
      paymentMilestones,
      serviceProviderSignature,
    };

    const agreement = await createAgreement(agreementData);

    res.status(201).json({
      success: true,
      message: 'Agreement created successfully',
      agreement,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/agreements/sign/:token
 * @desc    Get agreement for signing (public, no auth)
 * @access  Public
 * NOTE: This route must be defined BEFORE /:id to avoid route conflicts
 */
router.get('/sign/:token', async (req, res, next) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required',
      });
    }

    const validation = await validateSignatureToken(token);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.expired ? 'Signature link has expired' : 'Invalid token',
        expired: validation.expired,
      });
    }

    res.status(200).json({
      success: true,
      agreement: validation.agreement,
      link: {
        clientId: validation.link?.clientId,
        clientName: validation.link?.clientName,
        clientOrganization: validation.link?.clientOrganization,
        expiresAt: validation.link?.expiresAt,
        status: validation.link?.status,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/agreements/sign/:token
 * @desc    Submit client signature (public, no auth)
 * @access  Public
 * NOTE: This route must be defined BEFORE /:id to avoid route conflicts
 */
router.post('/sign/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const { signerName, signatureImage } = req.body;

    if (!token || !signerName || !signatureImage) {
      return res.status(400).json({
        success: false,
        message: 'Token, signerName, and signatureImage are required',
      });
    }

    // Get IP address from request
    const ipAddress = req.ip || req.socket.remoteAddress || undefined;

    const result = await submitClientSignature(token, { signerName, signatureImage }, ipAddress);

    res.status(200).json({
      success: true,
      message: 'Signature submitted successfully',
      pdfUrl: result.pdfUrl,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/agreements/sign/:token
 * @desc    Update client signature (public, no auth, within 2 days)
 * @access  Public
 * NOTE: This route must be defined BEFORE /:id to avoid route conflicts
 */
router.put('/sign/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const { signerName, signatureImage } = req.body;

    if (!token || !signerName || !signatureImage) {
      return res.status(400).json({
        success: false,
        message: 'Token, signerName, and signatureImage are required',
      });
    }

    // Validate token first
    const validation = await validateSignatureToken(token);
    if (!validation.valid || !validation.link) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    // Check if already signed
    if (validation.link.status === 'client_signed') {
      return res.status(400).json({
        success: false,
        message: 'Agreement has already been signed and cannot be updated',
      });
    }

    // Check if expired
    if (validation.expired) {
      return res.status(400).json({
        success: false,
        message: 'Signature link has expired',
      });
    }

    // Get IP address
    const ipAddress = req.ip || req.socket.remoteAddress || undefined;

    // Delete old signature if exists (by deleting the link and recreating)
    // Actually, we'll just submit a new signature which will replace the old one
    // But first, let's check if there's an existing signature
    const client = await (await import('../config/database')).default.connect();
    try {
      const existingSig = await client.query(
        `SELECT id FROM agreement_signatures 
         WHERE "agreementId" = $1 AND "clientId" = $2 AND "signerType" = 'client'`,
        [validation.agreement!.id, validation.link.clientId]
      );

      if (existingSig.rows.length > 0) {
        // Delete old signature file and record
        const sigResult = await client.query(
          `SELECT "signatureImagePath" FROM agreement_signatures WHERE id = $1`,
          [existingSig.rows[0].id]
        );
        
        if (sigResult.rows.length > 0) {
          const BlobStorageService = (await import('../services/blobStorageService')).default;
          try {
            await BlobStorageService.deleteFile(sigResult.rows[0].signatureImagePath);
          } catch (error) {
            console.error('Error deleting old signature file:', error);
          }
        }

        await client.query(`DELETE FROM agreement_signatures WHERE id = $1`, [existingSig.rows[0].id]);
      }
    } finally {
      client.release();
    }

    // Submit new signature
    await submitClientSignature(token, { signerName, signatureImage }, ipAddress);

    res.status(200).json({
      success: true,
      message: 'Signature updated successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/agreements/project/:projectId
 * @desc    Get agreement by project ID
 * @access  Private
 */
router.get('/project/:projectId', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const projectId = decodeAgreementId(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid project ID',
      });
    }

    const agreement = await getAgreementByProjectId(projectId, req.user.userId);

    if (!agreement) {
      return res.status(404).json({
        success: false,
        message: 'Agreement not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Agreement retrieved successfully',
      agreement,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/agreements/:id
 * @desc    Get agreement by ID
 * @access  Private
 */
router.get('/:id', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const agreementId = decodeAgreementId(req.params.id);
    if (!agreementId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid agreement ID',
      });
    }

    const agreement = await getAgreementById(agreementId, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Agreement retrieved successfully',
      agreement,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/agreements/:id
 * @desc    Update agreement
 * @access  Private
 */
router.put('/:id', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const agreementId = decodeAgreementId(req.params.id);
    if (!agreementId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid agreement ID',
      });
    }

    const {
      serviceProviderName,
      agreementDate,
      serviceType,
      startDate,
      endDate,
      duration,
      durationUnit,
      numberOfRevisions,
      jurisdiction,
      deliverables,
      paymentStructure,
      paymentMethod,
      paymentMilestones,
    } = req.body;

    const updateData: any = {};

    if (serviceProviderName !== undefined) updateData.serviceProviderName = serviceProviderName;
    if (agreementDate !== undefined) updateData.agreementDate = agreementDate;
    if (serviceType !== undefined) updateData.serviceType = serviceType;
    if (startDate !== undefined) updateData.startDate = startDate;
    if (endDate !== undefined) updateData.endDate = endDate;
    if (duration !== undefined) updateData.duration = parseInt(duration, 10);
    if (durationUnit !== undefined) updateData.durationUnit = durationUnit;
    if (numberOfRevisions !== undefined) updateData.numberOfRevisions = numberOfRevisions;
    if (jurisdiction !== undefined) updateData.jurisdiction = jurisdiction;
    if (deliverables !== undefined) updateData.deliverables = deliverables;
    if (paymentStructure !== undefined) updateData.paymentStructure = paymentStructure;
    if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
    if (paymentMilestones !== undefined) updateData.paymentMilestones = paymentMilestones;

    const agreement = await updateAgreement(agreementId, req.user.userId, updateData);

    res.status(200).json({
      success: true,
      message: 'Agreement updated successfully',
      agreement,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/agreements/:id
 * @desc    Delete agreement
 * @access  Private
 */
router.delete('/:id', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const agreementId = decodeAgreementId(req.params.id);
    if (!agreementId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid agreement ID',
      });
    }

    await deleteAgreement(agreementId, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Agreement deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/agreements/:id/send
 * @desc    Send agreement to clients
 * @access  Private
 */
router.post('/:id/send', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const agreementId = decodeAgreementId(req.params.id);
    if (!agreementId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid agreement ID',
      });
    }

    const { clientIds } = req.body;

    if (!Array.isArray(clientIds) || clientIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'clientIds must be a non-empty array',
      });
    }

    // Get frontend URL from environment variable or construct from request
    // Frontend URL should be the client-facing URL (e.g., http://localhost:5173 in dev)
    const frontendUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 
      (process.env.NODE_ENV === 'production' 
        ? `${req.protocol}://${req.get('host')}` 
        : 'http://localhost:5173');

    await sendAgreementToClients(agreementId, req.user.userId, clientIds, frontendUrl);

    res.status(200).json({
      success: true,
      message: 'Agreement sent to clients successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
