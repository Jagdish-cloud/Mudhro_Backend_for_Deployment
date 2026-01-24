import express from 'express';
import multer from 'multer';
import pool from '../config/database';
import {
  createMasterClient,
  getMasterClientsByUserId,
  getMasterClientById,
  updateMasterClient,
  deleteMasterClient,
} from '../services/masterClientService';
import {
  getClientDocuments,
  createClientDocument,
  deleteClientDocument,
} from '../services/clientDocumentService';
import {
  createClientNote,
  getClientNotes,
  getLatestClientNote,
  getClientNoteById,
  updateClientNote,
  deleteClientNote,
} from '../services/clientNoteService';
import {
  validateCreateMasterClient,
  validateUpdateMasterClient,
} from '../middleware/masterClientValidator';
import {
  validateCreateClientNote,
  validateUpdateClientNote,
} from '../middleware/clientNoteValidator';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { decodeId, urlDecode } from '../utils/urlEncoder';
import BlobStorageService, { FileType } from '../services/blobStorageService';

const router = express.Router();

/**
 * Helper function to decode a client ID from req.params
 * Handles both numeric IDs and encoded IDs (Hashids or base64url)
 */
const decodeClientId = (paramId: string): number | null => {
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
        console.log(`[MasterClient Route] Successfully decoded base64url: ${paramId} -> ${decoded}`);
      }
    } catch (error) {
      console.warn(`[MasterClient Route] Failed to decode ID "${paramId}":`, error);
    }
  } else {
    console.log(`[MasterClient Route] Successfully decoded Hashids: ${paramId} -> ${decoded}`);
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

/**
 * @route   POST /api/master-clients
 * @desc    Create a new master client
 * @access  Private
 */
router.post(
  '/',
  authenticateToken,
  validateCreateMasterClient,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const clientData = {
        ...req.body,
        userId: req.user.userId,
      };

      const client = await createMasterClient(clientData);

      res.status(201).json({
        success: true,
        message: 'Master client created successfully',
        client,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/master-clients
 * @desc    Get all master clients for the authenticated user
 * @access  Private
 */
router.get('/', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    // Note: projectId parameter is deprecated - filtering by project is no longer supported
    // Use projectClientService.getClientsByProjectId instead for filtering clients by project
    const clients = await getMasterClientsByUserId(req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Master clients retrieved successfully',
      clients,
      count: clients.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/master-clients/:id
 * @desc    Get a specific master client by ID
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

    const clientId = decodeClientId(req.params.id);
    if (clientId === null || clientId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid client ID',
      });
    }

    const client = await getMasterClientById(clientId, req.user.userId);

    res.status(200).json({
      success: true,
      client,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/master-clients/:id
 * @desc    Update a master client
 * @access  Private
 */
router.put(
  '/:id',
  authenticateToken,
  validateUpdateMasterClient,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const clientId = decodeClientId(req.params.id);
      if (clientId === null || clientId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid client ID',
        });
      }

      const client = await updateMasterClient(
        clientId,
        req.user.userId,
        req.body
      );

      res.status(200).json({
        success: true,
        message: 'Master client updated successfully',
        client,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/master-clients/:id
 * @desc    Delete a master client
 * @access  Private
 */
router.delete(
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

      const clientId = decodeClientId(req.params.id);
      if (clientId === null || clientId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid client ID',
        });
      }

      await deleteMasterClient(clientId, req.user.userId);

      res.status(200).json({
        success: true,
        message: 'Master client deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/master-clients/:id/documents
 * @desc    Get all documents for a client
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

    const clientId = decodeClientId(req.params.id);
    if (clientId === null || clientId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid client ID',
      });
    }

    const documents = await getClientDocuments(clientId, req.user.userId);

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
 * @route   POST /api/master-clients/:id/documents
 * @desc    Upload a document for a client
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

      const clientId = decodeClientId(req.params.id);
      if (clientId === null || clientId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid client ID',
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
        FileType.CLIENT_DOCUMENT,
        clientId,
        req.file.mimetype
      );

      // Create document record
      const document = await createClientDocument(
        {
          clientId,
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
 * @route   GET /api/master-clients/:id/documents/:documentId/download
 * @desc    Download a client document
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

      const clientId = decodeClientId(req.params.id);
      if (clientId === null || clientId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid client ID',
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
        // Get document and verify it belongs to user's client
        const docResult = await client.query(
          `SELECT cd."fileName", cd."filePath", cd."mimeType"
           FROM client_documents cd
           INNER JOIN master_clients mc ON cd."clientId" = mc.id
           WHERE cd.id = $1 AND mc."userId" = $2`,
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
 * @route   DELETE /api/master-clients/:id/documents/:documentId
 * @desc    Delete a client document
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

      const clientId = decodeClientId(req.params.id);
      if (clientId === null || clientId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid client ID',
        });
      }

      const documentId = parseInt(req.params.documentId, 10);
      if (isNaN(documentId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid document ID',
        });
      }

      await deleteClientDocument(documentId, req.user.userId);

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
 * @route   GET /api/master-clients/:id/notes
 * @desc    Get all notes for a client
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

    const clientId = decodeClientId(req.params.id);
    if (clientId === null || clientId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid client ID',
      });
    }

    const notes = await getClientNotes(clientId, req.user.userId);

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
 * @route   GET /api/master-clients/:id/notes/latest
 * @desc    Get latest note for a client
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

    const clientId = decodeClientId(req.params.id);
    if (clientId === null || clientId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid client ID',
      });
    }

    const note = await getLatestClientNote(clientId, req.user.userId);

    res.status(200).json({
      success: true,
      note: note || null,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/master-clients/:id/notes
 * @desc    Create a new note for a client
 * @access  Private
 */
router.post(
  '/:id/notes',
  authenticateToken,
  validateCreateClientNote,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const clientId = decodeClientId(req.params.id);
      if (clientId === null || clientId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid client ID',
        });
      }

      const note = await createClientNote(clientId, req.user.userId, req.body);

      res.status(201).json({
        success: true,
        message: 'Client note created successfully',
        note,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/master-clients/:id/notes/:noteId
 * @desc    Get a specific note for a client
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

    const note = await getClientNoteById(noteId, req.user.userId);

    res.status(200).json({
      success: true,
      note,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/master-clients/:id/notes/:noteId
 * @desc    Update a note for a client
 * @access  Private
 */
router.put(
  '/:id/notes/:noteId',
  authenticateToken,
  validateUpdateClientNote,
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

      const note = await updateClientNote(noteId, req.user.userId, req.body);

      res.status(200).json({
        success: true,
        message: 'Client note updated successfully',
        note,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/master-clients/:id/notes/:noteId
 * @desc    Delete a note for a client
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

    await deleteClientNote(noteId, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Client note deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;

