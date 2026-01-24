import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import {
  createExpense,
  deleteExpense,
  getExpenseById,
  getExpensesByUserId,
  updateExpense,
  updateExpenseAttachmentFilename,
  updateExpensePdfFilename,
} from '../services/expenseService';
import {
  validateCreateExpense,
  validateUpdateExpense,
} from '../middleware/expenseValidator';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { decodeId, urlDecode } from '../utils/urlEncoder';

const router = express.Router();

/**
 * Helper function to decode an expense ID from req.params
 * Handles both numeric IDs and encoded IDs (Hashids or base64url)
 */
const decodeExpenseId = (paramId: string): number | null => {
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
        console.log(`[Expense Route] Successfully decoded base64url: ${paramId} -> ${decoded}`);
      }
    } catch (error) {
      console.warn(`[Expense Route] Failed to decode ID "${paramId}":`, error);
    }
  } else {
    console.log(`[Expense Route] Successfully decoded Hashids: ${paramId} -> ${decoded}`);
  }
  
  return decoded;
};

const expenseAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 5, // Maximum 5 files
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
    ];
    
    // Check MIME type
    if (!allowedMimes.includes(file.mimetype)) {
      cb(new Error('Only image files (JPEG, PNG, GIF, WebP) and PDF files are allowed'));
      return;
    }
    
    // Check file extension
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'];
    if (!allowedExtensions.includes(ext)) {
      cb(new Error('Invalid file extension'));
      return;
    }
    
    // Check for dangerous filenames
    const dangerousPatterns = /\.\.|\.exe|\.sh|\.bat|\.cmd|\.php|\.js$/i;
    if (dangerousPatterns.test(file.originalname)) {
      cb(new Error('Invalid filename. Potentially dangerous file detected'));
      return;
    }
    
    cb(null, true);
  },
});

const expensePdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    // Check MIME type
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('Only PDF files are allowed'));
      return;
    }
    
    // Check file extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.pdf') {
      cb(new Error('Invalid file extension. Only PDF files are allowed'));
      return;
    }
    
    // Check for dangerous filenames
    const dangerousPatterns = /\.\.|\.exe|\.sh|\.bat|\.cmd|\.php|\.js$/i;
    if (dangerousPatterns.test(file.originalname)) {
      cb(new Error('Invalid filename. Potentially dangerous file detected'));
      return;
    }
    
    cb(null, true);
  },
});

router.post(
  '/',
  authenticateToken,
  validateCreateExpense,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const expense = await createExpense({
        ...req.body,
        userId: req.user.userId,
      });

      res.status(201).json({
        success: true,
        message: 'Expense recorded successfully',
        expense,
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

    const expenses = await getExpensesByUserId(req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Expenses retrieved successfully',
      expenses,
      count: expenses.length,
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

    const expenseId = decodeExpenseId(req.params.id);
    if (expenseId === null || expenseId <= 0) {
      console.warn(`[Expense Route] Invalid expense ID: ${req.params.id}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid expense ID',
      });
    }

    console.log(`[Expense Route] Fetching expense ${expenseId} for user ${req.user.userId}`);
    const expense = await getExpenseById(expenseId, req.user.userId);
    console.log(`[Expense Route] Expense found: ${expense.id}, ${expense.billNumber}`);

    res.status(200).json({
      success: true,
      expense,
    });
  } catch (error) {
    next(error);
  }
});

router.put(
  '/:id',
  authenticateToken,
  validateUpdateExpense,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const expenseId = decodeExpenseId(req.params.id);
      if (expenseId === null || expenseId <= 0) {
        console.warn(`[Expense Route] Invalid expense ID for update: ${req.params.id}`);
        return res.status(400).json({
          success: false,
          message: 'Invalid expense ID',
        });
      }

      console.log(`[Expense Route] Updating expense ${expenseId} for user ${req.user.userId}`);
      const expense = await updateExpense(expenseId, req.user.userId, req.body);
      console.log(`[Expense Route] Expense updated successfully: ${expense.id}`);

      res.status(200).json({
        success: true,
        message: 'Expense updated successfully',
        expense,
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

    const expenseId = decodeExpenseId(req.params.id);
    if (expenseId === null || expenseId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid expense ID',
      });
    }

    await deleteExpense(expenseId, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Expense deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/expenses/:id/attachment
 * @desc    Upload expense attachment (image/PDF)
 * @access  Private
 */
router.post(
  '/:id/attachment',
  authenticateToken,
  expenseAttachmentUpload.single('attachment'),
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const expenseId = decodeExpenseId(req.params.id);
      if (expenseId === null || expenseId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid expense ID',
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Attachment file is required',
        });
      }

      const expense = await getExpenseById(expenseId, req.user.userId);

      const expensesRoot = path.join(process.cwd(), 'Expenses', String(req.user.userId));
      await fs.promises.mkdir(expensesRoot, { recursive: true });

      const fileExtension = path.extname(req.file.originalname) || 
        (req.file.mimetype === 'application/pdf' ? '.pdf' : 
         req.file.mimetype.startsWith('image/') ? '.jpg' : '');
      const fileName = `${expense.billNumber || `BILL-${expenseId}`}_${Date.now()}${fileExtension}`;
      const filePath = path.join(expensesRoot, fileName);

      await fs.promises.writeFile(filePath, req.file.buffer);

      // Delete old attachment if exists
      if (expense.attachmentFileName) {
        const oldPath = path.join(expensesRoot, expense.attachmentFileName);
        await fs.promises.rm(oldPath, { force: true });
      }

      try {
        await updateExpenseAttachmentFilename(expenseId, req.user.userId, fileName);
      } catch (error) {
        await fs.promises.rm(filePath, { force: true });
        throw error;
      }

      res.status(200).json({
        success: true,
        message: 'Expense attachment uploaded successfully',
        attachmentFileName: fileName,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/expenses/:id/pdf
 * @desc    Upload and store expense PDF (generated from preview)
 * @access  Private
 */
router.post(
  '/:id/pdf',
  authenticateToken,
  expensePdfUpload.single('expensePdf'),
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const expenseId = decodeExpenseId(req.params.id);
      if (expenseId === null || expenseId <= 0) {
        console.warn(`[Expense Route] Invalid expense ID for PDF upload: ${req.params.id}`);
        return res.status(400).json({
          success: false,
          message: 'Invalid expense ID',
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Expense PDF file is required',
        });
      }

      console.log(`[Expense Route] Uploading PDF for expense ${expenseId}, user ${req.user.userId}`);
      const expense = await getExpenseById(expenseId, req.user.userId);
      console.log(`[Expense Route] Expense found: ${expense.id}, ${expense.billNumber}`);

      const expensesRoot = path.join(process.cwd(), 'Expenses', String(req.user.userId));
      await fs.promises.mkdir(expensesRoot, { recursive: true });

      const fileName = expense.billNumber && expense.billNumber.endsWith('.pdf')
        ? expense.billNumber
        : `${expense.billNumber || `BILL-${expenseId}`}.pdf`;
      const filePath = path.join(expensesRoot, fileName);

      console.log(`[Expense Route] Saving PDF to: ${filePath}`);
      await fs.promises.writeFile(filePath, req.file.buffer);
      console.log(`[Expense Route] PDF file saved successfully`);

      if (expense.expenseFileName && expense.expenseFileName !== fileName) {
        const previousPath = path.join(expensesRoot, expense.expenseFileName);
        console.log(`[Expense Route] Deleting old PDF: ${previousPath}`);
        await fs.promises.rm(previousPath, { force: true });
      }

      try {
        console.log(`[Expense Route] Updating expense PDF filename in database: ${fileName}`);
        await updateExpensePdfFilename(expenseId, req.user.userId, fileName);
        console.log(`[Expense Route] Database updated successfully`);
      } catch (error) {
        console.error(`[Expense Route] Error updating database, cleaning up file:`, error);
        await fs.promises.rm(filePath, { force: true });
        throw error;
      }

      res.status(200).json({
        success: true,
        message: 'Expense PDF uploaded successfully',
        expenseFileName: fileName,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/expenses/:id/pdf
 * @desc    Download expense PDF (generated from preview)
 * @access  Private
 */
router.get('/:id/pdf', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const expenseId = decodeExpenseId(req.params.id);
    if (expenseId === null || expenseId <= 0) {
      console.warn(`[Expense Route] Invalid expense ID: ${req.params.id}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid expense ID',
      });
    }

    console.log(`[Expense Route] Fetching expense ${expenseId} for user ${req.user.userId}`);
    const expense = await getExpenseById(expenseId, req.user.userId);
    console.log(`[Expense Route] Expense found: ${expense.id}, ${expense.billNumber}`);

    const expensesRoot = path.join(process.cwd(), 'Expenses', String(req.user.userId));
    const fileName = expense.expenseFileName && expense.expenseFileName.trim() !== ''
      ? expense.expenseFileName
      : expense.billNumber && expense.billNumber.endsWith('.pdf')
        ? expense.billNumber
        : `${expense.billNumber || `BILL-${expenseId}`}.pdf`;
    const filePath = path.join(expensesRoot, fileName);

    console.log(`[Expense Route] Looking for PDF at: ${filePath}`);
    console.log(`[Expense Route] Expense fileName from DB: ${expense.expenseFileName || 'null'}`);
    console.log(`[Expense Route] Bill number: ${expense.billNumber || 'null'}`);

    if (!fs.existsSync(filePath)) {
      console.warn(`[Expense Route] PDF file not found at: ${filePath}`);
      console.log(`[Expense Route] Expenses directory exists: ${fs.existsSync(expensesRoot)}`);
      if (fs.existsSync(expensesRoot)) {
        const files = await fs.promises.readdir(expensesRoot);
        console.log(`[Expense Route] Files in expenses directory:`, files);
      }
      return res.status(404).json({
        success: false,
        message: 'Expense PDF not found. Please regenerate the PDF from the expense edit page.',
      });
    }

    console.log(`[Expense Route] PDF file found, sending: ${fileName}`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/expenses/:id/attachment
 * @desc    Download expense attachment (uploaded image/PDF)
 * @access  Private
 */
router.get('/:id/attachment', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const expenseId = decodeExpenseId(req.params.id);
    if (expenseId === null || expenseId <= 0) {
      console.warn(`[Expense Route] Invalid expense ID: ${req.params.id}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid expense ID',
      });
    }

    console.log(`[Expense Route] Fetching expense ${expenseId} for user ${req.user.userId}`);
    const expense = await getExpenseById(expenseId, req.user.userId);
    console.log(`[Expense Route] Expense found: ${expense.id}, ${expense.billNumber}`);

    if (!expense.attachmentFileName) {
      return res.status(404).json({
        success: false,
        message: 'Expense attachment not found',
      });
    }

    const expensesRoot = path.join(process.cwd(), 'Expenses', String(req.user.userId));
    const filePath = path.join(expensesRoot, expense.attachmentFileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Expense attachment file not found',
      });
    }

    const isPdf = expense.attachmentFileName.endsWith('.pdf');
    res.setHeader('Content-Type', isPdf ? 'application/pdf' : 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${expense.attachmentFileName}"`);
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
});

export default router;


