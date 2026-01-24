import pool from '../config/database';
import { AppError } from '../middleware/errorHandler';
import path from 'path';
import { promises as fs } from 'fs';
import BlobStorageService, { FileType } from './blobStorageService';

export interface VendorDocument {
  id: number;
  vendorId: number;
  fileName: string;
  filePath: string;
  fileSize?: number;
  mimeType?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface VendorDocumentCreateData {
  vendorId: number;
  fileName: string;
  filePath: string;
  fileSize?: number;
  mimeType?: string;
}

/**
 * Get all documents for a vendor
 */
export const getVendorDocuments = async (
  vendorId: number,
  userId: number
): Promise<VendorDocument[]> => {
  const client = await pool.connect();

  try {
    // Verify vendor belongs to user
    const vendorCheck = await client.query(
      'SELECT id FROM vendors WHERE id = $1 AND "userId" = $2',
      [vendorId, userId]
    );

    if (vendorCheck.rows.length === 0) {
      throw new AppError('Vendor not found', 404);
    }

    const result = await client.query(
      `SELECT 
        id, "vendorId", "fileName", "filePath", "fileSize", "mimeType",
        "createdAt", "updatedAt"
      FROM vendor_documents 
      WHERE "vendorId" = $1
      ORDER BY "createdAt" DESC`,
      [vendorId]
    );

    return result.rows.map(mapDocumentFromDb);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error fetching vendor documents:', error);
    throw new AppError('Failed to fetch vendor documents', 500);
  } finally {
    client.release();
  }
};

/**
 * Create a new vendor document
 */
export const createVendorDocument = async (
  documentData: VendorDocumentCreateData,
  userId: number
): Promise<VendorDocument> => {
  const client = await pool.connect();

  try {
    // Verify vendor belongs to user
    const vendorCheck = await client.query(
      'SELECT id FROM vendors WHERE id = $1 AND "userId" = $2',
      [documentData.vendorId, userId]
    );

    if (vendorCheck.rows.length === 0) {
      throw new AppError('Vendor not found', 404);
    }

    // Check document count (max 5)
    const countResult = await client.query(
      'SELECT COUNT(*) as count FROM vendor_documents WHERE "vendorId" = $1',
      [documentData.vendorId]
    );

    const currentCount = parseInt(countResult.rows[0].count, 10);
    if (currentCount >= 5) {
      throw new AppError('Maximum 5 documents allowed per vendor', 400);
    }

    const result = await client.query(
      `INSERT INTO vendor_documents (
        "vendorId", "fileName", "filePath", "fileSize", "mimeType",
        "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING 
        id, "vendorId", "fileName", "filePath", "fileSize", "mimeType",
        "createdAt", "updatedAt"`,
      [
        documentData.vendorId,
        documentData.fileName,
        documentData.filePath,
        documentData.fileSize || null,
        documentData.mimeType || null,
      ]
    );

    return mapDocumentFromDb(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error creating vendor document:', error);
    throw new AppError('Failed to create vendor document', 500);
  } finally {
    client.release();
  }
};

/**
 * Delete a vendor document
 */
export const deleteVendorDocument = async (
  documentId: number,
  userId: number
): Promise<void> => {
  const client = await pool.connect();

  try {
    // Get document and verify it belongs to user's vendor
    const docResult = await client.query(
      `SELECT vd.id, vd."filePath", vd."vendorId"
       FROM vendor_documents vd
       INNER JOIN vendors v ON vd."vendorId" = v.id
       WHERE vd.id = $1 AND v."userId" = $2`,
      [documentId, userId]
    );

    if (docResult.rows.length === 0) {
      throw new AppError('Document not found', 404);
    }

    const document = docResult.rows[0];

    // Delete file from Azure Blob Storage (required - no local fallback)
    try {
      await BlobStorageService.deleteFile(document.filePath);
    } catch (fileError) {
      console.warn('Failed to delete file from Azure Blob:', fileError);
      // Continue with database deletion even if file deletion fails
    }

    // Delete from database
    await client.query('DELETE FROM vendor_documents WHERE id = $1', [documentId]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error deleting vendor document:', error);
    throw new AppError('Failed to delete vendor document', 500);
  } finally {
    client.release();
  }
};

/**
 * Map database document to VendorDocument
 */
const mapDocumentFromDb = (dbDoc: any): VendorDocument => {
  return {
    id: dbDoc.id,
    vendorId: dbDoc.vendorId,
    fileName: dbDoc.fileName,
    filePath: dbDoc.filePath,
    fileSize: dbDoc.fileSize,
    mimeType: dbDoc.mimeType,
    createdAt: new Date(dbDoc.createdAt),
    updatedAt: new Date(dbDoc.updatedAt),
  };
};

