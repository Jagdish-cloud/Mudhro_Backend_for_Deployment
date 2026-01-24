import pool from '../config/database';
import { AppError } from '../middleware/errorHandler';
import path from 'path';
import { promises as fs } from 'fs';
import BlobStorageService, { FileType } from './blobStorageService';

export interface ClientDocument {
  id: number;
  clientId: number;
  fileName: string;
  filePath: string;
  fileSize?: number;
  mimeType?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClientDocumentCreateData {
  clientId: number;
  fileName: string;
  filePath: string;
  fileSize?: number;
  mimeType?: string;
}

/**
 * Get all documents for a client
 */
export const getClientDocuments = async (
  clientId: number,
  userId: number
): Promise<ClientDocument[]> => {
  const client = await pool.connect();

  try {
    // Verify client belongs to user
    const clientCheck = await client.query(
      'SELECT id FROM master_clients WHERE id = $1 AND "userId" = $2',
      [clientId, userId]
    );

    if (clientCheck.rows.length === 0) {
      throw new AppError('Client not found', 404);
    }

    const result = await client.query(
      `SELECT 
        id, "clientId", "fileName", "filePath", "fileSize", "mimeType",
        "createdAt", "updatedAt"
      FROM client_documents 
      WHERE "clientId" = $1
      ORDER BY "createdAt" DESC`,
      [clientId]
    );

    return result.rows.map(mapDocumentFromDb);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error fetching client documents:', error);
    throw new AppError('Failed to fetch client documents', 500);
  } finally {
    client.release();
  }
};

/**
 * Create a new client document
 */
export const createClientDocument = async (
  documentData: ClientDocumentCreateData,
  userId: number
): Promise<ClientDocument> => {
  const client = await pool.connect();

  try {
    // Verify client belongs to user
    const clientCheck = await client.query(
      'SELECT id FROM master_clients WHERE id = $1 AND "userId" = $2',
      [documentData.clientId, userId]
    );

    if (clientCheck.rows.length === 0) {
      throw new AppError('Client not found', 404);
    }

    // Check document count (max 5)
    const countResult = await client.query(
      'SELECT COUNT(*) as count FROM client_documents WHERE "clientId" = $1',
      [documentData.clientId]
    );

    const currentCount = parseInt(countResult.rows[0].count, 10);
    if (currentCount >= 5) {
      throw new AppError('Maximum 5 documents allowed per client', 400);
    }

    const result = await client.query(
      `INSERT INTO client_documents (
        "clientId", "fileName", "filePath", "fileSize", "mimeType",
        "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING 
        id, "clientId", "fileName", "filePath", "fileSize", "mimeType",
        "createdAt", "updatedAt"`,
      [
        documentData.clientId,
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
    console.error('Error creating client document:', error);
    throw new AppError('Failed to create client document', 500);
  } finally {
    client.release();
  }
};

/**
 * Delete a client document
 */
export const deleteClientDocument = async (
  documentId: number,
  userId: number
): Promise<void> => {
  const client = await pool.connect();

  try {
    // Get document and verify it belongs to user's client
    const docResult = await client.query(
      `SELECT cd.id, cd."filePath", cd."clientId"
       FROM client_documents cd
       INNER JOIN master_clients mc ON cd."clientId" = mc.id
       WHERE cd.id = $1 AND mc."userId" = $2`,
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
    await client.query('DELETE FROM client_documents WHERE id = $1', [documentId]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error deleting client document:', error);
    throw new AppError('Failed to delete client document', 500);
  } finally {
    client.release();
  }
};

/**
 * Map database document to ClientDocument
 */
const mapDocumentFromDb = (dbDoc: any): ClientDocument => {
  return {
    id: dbDoc.id,
    clientId: dbDoc.clientId,
    fileName: dbDoc.fileName,
    filePath: dbDoc.filePath,
    fileSize: dbDoc.fileSize,
    mimeType: dbDoc.mimeType,
    createdAt: new Date(dbDoc.createdAt),
    updatedAt: new Date(dbDoc.updatedAt),
  };
};

