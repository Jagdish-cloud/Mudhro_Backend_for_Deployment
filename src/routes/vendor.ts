import express from 'express';
import multer from 'multer';
import pool from '../config/database';
import {
  createVendor,
  deleteVendor,
  getVendorById,
  getVendorsByUserId,
  updateVendor,
} from '../services/vendorService';
import {
  getVendorDocuments,
  createVendorDocument,
  deleteVendorDocument,
} from '../services/vendorDocumentService';
import {
  createVendorNote,
  getVendorNotes,
  getLatestVendorNote,
  getVendorNoteById,
  updateVendorNote,
  deleteVendorNote,
} from '../services/vendorNoteService';
import {
  validateCreateVendor,
  validateUpdateVendor,
} from '../middleware/vendorValidator';
import {
  validateCreateVendorNote,
  validateUpdateVendorNote,
} from '../middleware/vendorNoteValidator';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { decodeId, urlDecode } from '../utils/urlEncoder';
import BlobStorageService, { FileType } from '../services/blobStorageService';

const router = express.Router();

/**
 * Helper function to decode a vendor ID from req.params
 * Handles both numeric IDs and encoded IDs (Hashids or base64url)
 */
const decodeVendorId = (paramId: string): number | null => {
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
        console.log(`[Vendor Route] Successfully decoded base64url: ${paramId} -> ${decoded}`);
      }
    } catch (error) {
      console.warn(`[Vendor Route] Failed to decode ID "${paramId}":`, error);
    }
  } else {
    console.log(`[Vendor Route] Successfully decoded Hashids: ${paramId} -> ${decoded}`);
  }
  
  return decoded;
};

// Configure multer for document uploads
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

router.post(
  '/',
  authenticateToken,
  validateCreateVendor,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const vendor = await createVendor({
        ...req.body,
        userId: req.user.userId,
      });

      res.status(201).json({
        success: true,
        message: 'Vendor created successfully',
        vendor,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const vendors = await getVendorsByUserId(req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Vendors retrieved successfully',
      vendors,
      count: vendors.length,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const vendorId = decodeVendorId(req.params.id);
    if (vendorId === null || vendorId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID',
      });
    }

    const vendor = await getVendorById(vendorId, req.user.userId);

    res.status(200).json({
      success: true,
      vendor,
    });
  } catch (error) {
    next(error);
  }
});

router.put(
  '/:id',
  authenticateToken,
  validateUpdateVendor,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const vendorId = decodeVendorId(req.params.id);
      if (vendorId === null || vendorId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid vendor ID',
        });
      }

      const vendor = await updateVendor(vendorId, req.user.userId, req.body);

      res.status(200).json({
        success: true,
        message: 'Vendor updated successfully',
        vendor,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.delete('/:id', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const vendorId = decodeVendorId(req.params.id);
    if (vendorId === null || vendorId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID',
      });
    }

    await deleteVendor(vendorId, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Vendor deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/vendors/:id/documents
 * @desc    Get all documents for a vendor
 * @access  Private
 */
router.get('/:id/documents', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const vendorId = decodeVendorId(req.params.id);
    if (vendorId === null || vendorId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID',
      });
    }

    const documents = await getVendorDocuments(vendorId, req.user.userId);

    res.status(200).json({
      success: true,
      documents,
      count: documents.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/vendors/:id/documents
 * @desc    Upload a document for a vendor
 * @access  Private
 */
router.post(
  '/:id/documents',
  authenticateToken,
  documentUpload.single('document'),
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const vendorId = decodeVendorId(req.params.id);
      if (vendorId === null || vendorId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid vendor ID',
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Document file is required',
        });
      }

      // Upload to Azure Blob Storage (required - no local fallback)
      const originalName = req.file.originalname;
      const blobPath = await BlobStorageService.uploadFile(
        req.file.buffer,
        originalName,
        FileType.VENDOR_DOCUMENT,
        vendorId,
        req.file.mimetype
      );

      // Create document record
      const document = await createVendorDocument(
        {
          vendorId,
          fileName: originalName,
          filePath: blobPath,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
        },
        req.user.userId
      );

      res.status(201).json({
        success: true,
        message: 'Document uploaded successfully',
        document,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/vendors/:id/documents/:documentId/download
 * @desc    Download a vendor document
 * @access  Private
 */
router.get(
  '/:id/documents/:documentId/download',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const vendorId = decodeVendorId(req.params.id);
      if (vendorId === null || vendorId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid vendor ID',
        });
      }

      const documentId = parseInt(req.params.documentId, 10);
      if (isNaN(documentId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid document ID',
        });
      }

      const client = await pool.connect();
      try {
        // Get document and verify it belongs to user's vendor
        const docResult = await client.query(
          `SELECT vd."fileName", vd."filePath", vd."mimeType"
           FROM vendor_documents vd
           INNER JOIN vendors v ON vd."vendorId" = v.id
           WHERE vd.id = $1 AND v."userId" = $2`,
          [documentId, req.user.userId]
        );

        if (docResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Document not found',
          });
        }

        const document = docResult.rows[0];

        // Download from Azure Blob Storage (required - no local fallback)
        const fileData = await BlobStorageService.downloadFile(document.filePath);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.fileName)}"`);
        res.setHeader('Content-Type', fileData.contentType);
        res.setHeader('Content-Length', fileData.contentLength);
        res.send(fileData.buffer);
      } finally {
        client.release();
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/vendors/:id/documents/:documentId
 * @desc    Delete a vendor document
 * @access  Private
 */
router.delete(
  '/:id/documents/:documentId',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const vendorId = decodeVendorId(req.params.id);
      if (vendorId === null || vendorId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid vendor ID',
        });
      }

      const documentId = parseInt(req.params.documentId, 10);
      if (isNaN(documentId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid document ID',
        });
      }

      await deleteVendorDocument(documentId, req.user.userId);

      res.status(200).json({
        success: true,
        message: 'Document deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/vendors/:id/notes
 * @desc    Get all notes for a vendor
 * @access  Private
 */
router.get('/:id/notes', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const vendorId = decodeVendorId(req.params.id);
    if (vendorId === null || vendorId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID',
      });
    }

    const notes = await getVendorNotes(vendorId, req.user.userId);

    res.status(200).json({
      success: true,
      notes,
      count: notes.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/vendors/:id/notes/latest
 * @desc    Get latest note for a vendor
 * @access  Private
 */
router.get('/:id/notes/latest', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const vendorId = decodeVendorId(req.params.id);
    if (vendorId === null || vendorId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID',
      });
    }

    const note = await getLatestVendorNote(vendorId, req.user.userId);

    res.status(200).json({
      success: true,
      note: note || null,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/vendors/:id/notes
 * @desc    Create a new note for a vendor
 * @access  Private
 */
router.post(
  '/:id/notes',
  authenticateToken,
  validateCreateVendorNote,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const vendorId = decodeVendorId(req.params.id);
      if (vendorId === null || vendorId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid vendor ID',
        });
      }

      const note = await createVendorNote(vendorId, req.user.userId, req.body);

      res.status(201).json({
        success: true,
        message: 'Vendor note created successfully',
        note,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/vendors/:id/notes/:noteId
 * @desc    Get a specific note for a vendor
 * @access  Private
 */
router.get('/:id/notes/:noteId', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const noteId = parseInt(req.params.noteId, 10);
    if (isNaN(noteId) || noteId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid note ID',
      });
    }

    const note = await getVendorNoteById(noteId, req.user.userId);

    res.status(200).json({
      success: true,
      note,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/vendors/:id/notes/:noteId
 * @desc    Update a note for a vendor
 * @access  Private
 */
router.put(
  '/:id/notes/:noteId',
  authenticateToken,
  validateUpdateVendorNote,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const noteId = parseInt(req.params.noteId, 10);
      if (isNaN(noteId) || noteId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid note ID',
        });
      }

      const note = await updateVendorNote(noteId, req.user.userId, req.body);

      res.status(200).json({
        success: true,
        message: 'Vendor note updated successfully',
        note,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/vendors/:id/notes/:noteId
 * @desc    Delete a note for a vendor
 * @access  Private
 */
router.delete('/:id/notes/:noteId', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const noteId = parseInt(req.params.noteId, 10);
    if (isNaN(noteId) || noteId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid note ID',
      });
    }

    await deleteVendorNote(noteId, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Vendor note deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;


