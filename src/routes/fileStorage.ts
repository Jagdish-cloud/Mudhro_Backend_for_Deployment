import express from 'express';
import multer from 'multer';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import {
  uploadFile,
  downloadFile,
  deleteFile,
  getFileUrl,
} from '../controllers/fileStorageController';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    // Allow all file types for now
    // You can add specific file type validation here if needed
    cb(null, true);
  },
});

/**
 * @route   POST /api/files/upload
 * @desc    Upload a file to Azure Blob Storage
 * @access  Private
 * @body    fileType: Logos | Invoices | Expenses | ClientDocuments | VendorDocuments
 * @body    relatedId: User_ID, Client_ID, or Vendor_ID
 * @body    invoiceId: (optional, required for Invoices)
 * @body    expenseId: (optional, required for Expenses)
 * @body    file: The file to upload
 */
router.post('/upload', authenticateToken, upload.single('file'), uploadFile);

/**
 * @route   GET /api/files/download/:fileType/:relatedId/:fileName
 * @desc    Download a file from Azure Blob Storage
 * @access  Private
 * @query   invoiceId: (required for Invoices)
 * @query   expenseId: (required for Expenses)
 * @query   documentId: (required for ClientDocuments/VendorDocuments)
 */
router.get('/download/:fileType/:relatedId/:fileName', authenticateToken, downloadFile);

/**
 * @route   DELETE /api/files/:fileType/:relatedId
 * @desc    Delete a file from Azure Blob Storage
 * @access  Private
 * @query   invoiceId: (required for Invoices)
 * @query   expenseId: (required for Expenses)
 * @query   documentId: (required for ClientDocuments/VendorDocuments)
 */
router.delete('/:fileType/:relatedId', authenticateToken, deleteFile);

/**
 * @route   GET /api/files/url/:fileType/:relatedId
 * @desc    Get a download URL for a file (SAS URL)
 * @access  Private
 * @query   invoiceId: (required for Invoices)
 * @query   expenseId: (required for Expenses)
 * @query   documentId: (required for ClientDocuments/VendorDocuments)
 * @query   expiresInMinutes: (optional, default: 60)
 */
router.get('/url/:fileType/:relatedId', authenticateToken, getFileUrl);

export default router;

