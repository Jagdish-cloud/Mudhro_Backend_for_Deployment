import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import BlobStorageService, { FileType } from '../services/blobStorageService';
import { AppError } from '../middleware/errorHandler';
import pool from '../config/database';

/**
 * Upload a file to Azure Blob Storage
 * POST /api/files/upload
 */
export const uploadFile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Unauthorized', 401);
    }

    if (!req.file) {
      throw new AppError('No file provided', 400);
    }

    const { fileType, relatedId } = req.body;

    // Validate required fields
    if (!fileType || !relatedId) {
      throw new AppError('fileType and relatedId are required', 400);
    }

    // Validate fileType enum
    const validFileTypes = Object.values(FileType);
    if (!validFileTypes.includes(fileType as FileType)) {
      throw new AppError(`Invalid fileType. Must be one of: ${validFileTypes.join(', ')}`, 400);
    }

    const relatedIdNum = parseInt(relatedId, 10);
    if (isNaN(relatedIdNum) || relatedIdNum <= 0) {
      throw new AppError('Invalid relatedId', 400);
    }

    // Validate related ID exists and user has access
    await BlobStorageService.validateRelatedId(
      fileType as FileType,
      relatedIdNum,
      req.user.userId
    );

    // Upload file to Azure Blob
    const blobPath = await BlobStorageService.uploadFile(
      req.file.buffer,
      req.file.originalname,
      fileType as FileType,
      relatedIdNum,
      req.file.mimetype
    );

    // Create database entry based on file type
    const client = await pool.connect();
    let dbEntry;

    try {
      await client.query('BEGIN');
      
      switch (fileType) {
        case FileType.LOGO:
          // Update user logo
          await client.query('UPDATE users SET logo = $1 WHERE id = $2', [
            blobPath,
            relatedIdNum,
          ]);
          dbEntry = { blobPath, fileName: req.file.originalname };
          break;

        case FileType.INVOICE:
          // Update invoice file name
          const invoiceId = parseInt(req.body.invoiceId, 10);
          if (!invoiceId || isNaN(invoiceId)) {
            throw new AppError('invoiceId is required for invoice files', 400);
          }
          // Verify invoice belongs to user
          const invoiceCheck = await client.query(
            'SELECT id FROM invoices WHERE id = $1 AND "userId" = $2',
            [invoiceId, req.user.userId]
          );
          if (invoiceCheck.rows.length === 0) {
            throw new AppError('Invoice not found or unauthorized', 404);
          }
          await client.query('UPDATE invoices SET invoice_file_name = $1 WHERE id = $2', [
            req.file.originalname,
            invoiceId,
          ]);
          dbEntry = { blobPath, fileName: req.file.originalname, invoiceId };
          break;

        case FileType.EXPENSE:
          // Update expense file name
          const expenseId = parseInt(req.body.expenseId, 10);
          if (!expenseId || isNaN(expenseId)) {
            throw new AppError('expenseId is required for expense files', 400);
          }
          // Verify expense belongs to user
          const expenseCheck = await client.query(
            'SELECT id FROM expenses WHERE id = $1 AND "userId" = $2',
            [expenseId, req.user.userId]
          );
          if (expenseCheck.rows.length === 0) {
            throw new AppError('Expense not found or unauthorized', 404);
          }
          await client.query('UPDATE expenses SET expense_file_name = $1 WHERE id = $2', [
            req.file.originalname,
            expenseId,
          ]);
          dbEntry = { blobPath, fileName: req.file.originalname, expenseId };
          break;

        case FileType.CLIENT_DOCUMENT:
          // Create client document entry
          const clientDocResult = await client.query(
            `INSERT INTO client_documents (
              "clientId", "fileName", "filePath", "fileSize", "mimeType",
              "createdAt", "updatedAt"
            ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING id, "clientId", "fileName", "filePath", "fileSize", "mimeType",
              "createdAt", "updatedAt"`,
            [
              relatedIdNum,
              req.file.originalname,
              blobPath,
              req.file.size,
              req.file.mimetype,
            ]
          );
          dbEntry = clientDocResult.rows[0];
          break;

        case FileType.VENDOR_DOCUMENT:
          // Create vendor document entry
          const vendorDocResult = await client.query(
            `INSERT INTO vendor_documents (
              "vendorId", "fileName", "filePath", "fileSize", "mimeType",
              "createdAt", "updatedAt"
            ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING id, "vendorId", "fileName", "filePath", "fileSize", "mimeType",
              "createdAt", "updatedAt"`,
            [
              relatedIdNum,
              req.file.originalname,
              blobPath,
              req.file.size,
              req.file.mimetype,
            ]
          );
          dbEntry = vendorDocResult.rows[0];
          break;

        default:
          throw new AppError('Invalid file type', 400);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      // Rollback blob upload
      try {
        await BlobStorageService.deleteFile(blobPath);
      } catch (deleteError) {
        console.error('Failed to rollback blob upload:', deleteError);
      }
      throw error;
    } finally {
      client.release();
    }

    res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      data: dbEntry,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Download a file from Azure Blob Storage
 * GET /api/files/download/:fileType/:relatedId/:fileName
 */
export const downloadFile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Unauthorized', 401);
    }

    const { fileType, relatedId, fileName } = req.params;

    // Validate fileType
    const validFileTypes = Object.values(FileType);
    if (!validFileTypes.includes(fileType as FileType)) {
      throw new AppError(`Invalid fileType. Must be one of: ${validFileTypes.join(', ')}`, 400);
    }

    const relatedIdNum = parseInt(relatedId, 10);
    if (isNaN(relatedIdNum) || relatedIdNum <= 0) {
      throw new AppError('Invalid relatedId', 400);
    }

    // Validate user has access
    await BlobStorageService.validateRelatedId(
      fileType as FileType,
      relatedIdNum,
      req.user.userId
    );

    // Get blob path from database based on file type
    const client = await pool.connect();
    let blobPath: string;

    try {
      switch (fileType) {
        case FileType.LOGO:
          const userResult = await client.query('SELECT logo FROM users WHERE id = $1', [
            relatedIdNum,
          ]);
          if (userResult.rows.length === 0 || !userResult.rows[0].logo) {
            throw new AppError('Logo not found', 404);
          }
          blobPath = userResult.rows[0].logo;
          break;

        case FileType.INVOICE:
          const invoiceId = parseInt(req.query.invoiceId as string, 10);
          if (!invoiceId || isNaN(invoiceId)) {
            throw new AppError('invoiceId query parameter is required', 400);
          }
          const invoiceResult = await client.query(
            'SELECT invoice_file_name FROM invoices WHERE id = $1 AND "userId" = $2',
            [invoiceId, req.user.userId]
          );
          if (invoiceResult.rows.length === 0) {
            throw new AppError('Invoice not found', 404);
          }
          blobPath = `Invoices/${relatedIdNum}/${invoiceResult.rows[0].invoice_file_name}`;
          break;

        case FileType.EXPENSE:
          const expenseId = parseInt(req.query.expenseId as string, 10);
          if (!expenseId || isNaN(expenseId)) {
            throw new AppError('expenseId query parameter is required', 400);
          }
          const expenseResult = await client.query(
            'SELECT expense_file_name FROM expenses WHERE id = $1 AND "userId" = $2',
            [expenseId, req.user.userId]
          );
          if (expenseResult.rows.length === 0) {
            throw new AppError('Expense not found', 404);
          }
          blobPath = `Expenses/${relatedIdNum}/${expenseResult.rows[0].expense_file_name}`;
          break;

        case FileType.CLIENT_DOCUMENT:
        case FileType.VENDOR_DOCUMENT:
          const docId = parseInt(req.query.documentId as string, 10);
          if (!docId || isNaN(docId)) {
            throw new AppError('documentId query parameter is required', 400);
          }
          const tableName =
            fileType === FileType.CLIENT_DOCUMENT ? 'client_documents' : 'vendor_documents';
          const docResult = await client.query(
            `SELECT "filePath" FROM ${tableName} WHERE id = $1`,
            [docId]
          );
          if (docResult.rows.length === 0) {
            throw new AppError('Document not found', 404);
          }
          blobPath = docResult.rows[0].filePath;
          break;

        default:
          throw new AppError('Invalid file type', 400);
      }
    } finally {
      client.release();
    }

    // Download file from Azure Blob
    const fileData = await BlobStorageService.downloadFile(blobPath);

    // Set response headers
    res.setHeader('Content-Type', fileData.contentType);
    res.setHeader('Content-Length', fileData.contentLength);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName || 'file')}"`
    );

    // Send file
    res.send(fileData.buffer);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a file from Azure Blob Storage
 * DELETE /api/files/:fileType/:relatedId/:documentId?
 */
export const deleteFile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Unauthorized', 401);
    }

    const { fileType, relatedId } = req.params;
    const { documentId, invoiceId, expenseId } = req.query;

    // Validate fileType
    const validFileTypes = Object.values(FileType);
    if (!validFileTypes.includes(fileType as FileType)) {
      throw new AppError(`Invalid fileType. Must be one of: ${validFileTypes.join(', ')}`, 400);
    }

    const relatedIdNum = parseInt(relatedId, 10);
    if (isNaN(relatedIdNum) || relatedIdNum <= 0) {
      throw new AppError('Invalid relatedId', 400);
    }

    // Validate user has access
    await BlobStorageService.validateRelatedId(
      fileType as FileType,
      relatedIdNum,
      req.user.userId
    );

    const client = await pool.connect();
    let blobPath: string;

    try {
      switch (fileType) {
        case FileType.LOGO:
          const userResult = await client.query('SELECT logo FROM users WHERE id = $1', [
            relatedIdNum,
          ]);
          if (userResult.rows.length === 0 || !userResult.rows[0].logo) {
            throw new AppError('Logo not found', 404);
          }
          blobPath = userResult.rows[0].logo;
          // Update database
          await client.query('UPDATE users SET logo = NULL WHERE id = $1', [relatedIdNum]);
          break;

        case FileType.INVOICE:
          if (!invoiceId) {
            throw new AppError('invoiceId query parameter is required', 400);
          }
          const invoiceIdNum = parseInt(invoiceId as string, 10);
          const invoiceResult = await client.query(
            'SELECT invoice_file_name FROM invoices WHERE id = $1 AND "userId" = $2',
            [invoiceIdNum, req.user.userId]
          );
          if (invoiceResult.rows.length === 0) {
            throw new AppError('Invoice not found', 404);
          }
          blobPath = `Invoices/${relatedIdNum}/${invoiceResult.rows[0].invoice_file_name}`;
          // Update database
          await client.query('UPDATE invoices SET invoice_file_name = NULL WHERE id = $1', [
            invoiceIdNum,
          ]);
          break;

        case FileType.EXPENSE:
          if (!expenseId) {
            throw new AppError('expenseId query parameter is required', 400);
          }
          const expenseIdNum = parseInt(expenseId as string, 10);
          const expenseResult = await client.query(
            'SELECT expense_file_name FROM expenses WHERE id = $1 AND "userId" = $2',
            [expenseIdNum, req.user.userId]
          );
          if (expenseResult.rows.length === 0) {
            throw new AppError('Expense not found', 404);
          }
          blobPath = `Expenses/${relatedIdNum}/${expenseResult.rows[0].expense_file_name}`;
          // Update database
          await client.query('UPDATE expenses SET expense_file_name = NULL WHERE id = $1', [
            expenseIdNum,
          ]);
          break;

        case FileType.CLIENT_DOCUMENT:
        case FileType.VENDOR_DOCUMENT:
          if (!documentId) {
            throw new AppError('documentId query parameter is required', 400);
          }
          const docIdNum = parseInt(documentId as string, 10);
          const tableName =
            fileType === FileType.CLIENT_DOCUMENT ? 'client_documents' : 'vendor_documents';
          const docResult = await client.query(`SELECT "filePath" FROM ${tableName} WHERE id = $1`, [
            docIdNum,
          ]);
          if (docResult.rows.length === 0) {
            throw new AppError('Document not found', 404);
          }
          blobPath = docResult.rows[0].filePath;
          // Delete from database
          await client.query(`DELETE FROM ${tableName} WHERE id = $1`, [docIdNum]);
          break;

        default:
          throw new AppError('Invalid file type', 400);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // Delete from Azure Blob
    await BlobStorageService.deleteFile(blobPath);

    res.status(200).json({
      success: true,
      message: 'File deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get file download URL
 * GET /api/files/url/:fileType/:relatedId
 */
export const getFileUrl = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Unauthorized', 401);
    }

    const { fileType, relatedId } = req.params;
    const { documentId, invoiceId, expenseId, expiresInMinutes } = req.query;

    // Validate fileType
    const validFileTypes = Object.values(FileType);
    if (!validFileTypes.includes(fileType as FileType)) {
      throw new AppError(`Invalid fileType. Must be one of: ${validFileTypes.join(', ')}`, 400);
    }

    const relatedIdNum = parseInt(relatedId, 10);
    if (isNaN(relatedIdNum) || relatedIdNum <= 0) {
      throw new AppError('Invalid relatedId', 400);
    }

    // Validate user has access
    await BlobStorageService.validateRelatedId(
      fileType as FileType,
      relatedIdNum,
      req.user.userId
    );

    // Get blob path from database
    const client = await pool.connect();
    let blobPath: string;

    try {
      switch (fileType) {
        case FileType.LOGO:
          const userResult = await client.query('SELECT logo FROM users WHERE id = $1', [
            relatedIdNum,
          ]);
          if (userResult.rows.length === 0 || !userResult.rows[0].logo) {
            throw new AppError('Logo not found', 404);
          }
          blobPath = userResult.rows[0].logo;
          break;

        case FileType.INVOICE:
          if (!invoiceId) {
            throw new AppError('invoiceId query parameter is required', 400);
          }
          const invoiceIdNum = parseInt(invoiceId as string, 10);
          const invoiceResult = await client.query(
            'SELECT invoice_file_name FROM invoices WHERE id = $1 AND "userId" = $2',
            [invoiceIdNum, req.user.userId]
          );
          if (invoiceResult.rows.length === 0) {
            throw new AppError('Invoice not found', 404);
          }
          blobPath = `Invoices/${relatedIdNum}/${invoiceResult.rows[0].invoice_file_name}`;
          break;

        case FileType.EXPENSE:
          if (!expenseId) {
            throw new AppError('expenseId query parameter is required', 400);
          }
          const expenseIdNum = parseInt(expenseId as string, 10);
          const expenseResult = await client.query(
            'SELECT expense_file_name FROM expenses WHERE id = $1 AND "userId" = $2',
            [expenseIdNum, req.user.userId]
          );
          if (expenseResult.rows.length === 0) {
            throw new AppError('Expense not found', 404);
          }
          blobPath = `Expenses/${relatedIdNum}/${expenseResult.rows[0].expense_file_name}`;
          break;

        case FileType.CLIENT_DOCUMENT:
        case FileType.VENDOR_DOCUMENT:
          if (!documentId) {
            throw new AppError('documentId query parameter is required', 400);
          }
          const docIdNum = parseInt(documentId as string, 10);
          const tableName =
            fileType === FileType.CLIENT_DOCUMENT ? 'client_documents' : 'vendor_documents';
          const docResult = await client.query(`SELECT "filePath" FROM ${tableName} WHERE id = $1`, [
            docIdNum,
          ]);
          if (docResult.rows.length === 0) {
            throw new AppError('Document not found', 404);
          }
          blobPath = docResult.rows[0].filePath;
          break;

        case FileType.SIGNATURES:
          const { signaturePath } = req.query;
          if (!signaturePath) {
            throw new AppError('signaturePath query parameter is required', 400);
          }
          // Validate that the signature belongs to a project owned by the user
          const sigPath = signaturePath as string;
          const projectIdFromPath = parseInt(sigPath.split('/')[1], 10);
          if (isNaN(projectIdFromPath)) {
            throw new AppError('Invalid signature path', 400);
          }
          // Validate project ownership
          const projectResult = await client.query(
            'SELECT id FROM projects WHERE id = $1 AND "userId" = $2',
            [projectIdFromPath, req.user.userId]
          );
          if (projectResult.rows.length === 0) {
            throw new AppError('Project not found or unauthorized', 404);
          }
          blobPath = sigPath;
          break;

        default:
          throw new AppError('Invalid file type', 400);
      }
    } finally {
      client.release();
    }

    // Generate download URL
    const expiresIn = expiresInMinutes
      ? parseInt(expiresInMinutes as string, 10)
      : 60;
    const url = await BlobStorageService.getDownloadUrl(blobPath, expiresIn);

    res.status(200).json({
      success: true,
      url,
      expiresIn: expiresIn * 60, // Return in seconds
    });
  } catch (error) {
    next(error);
  }
};

