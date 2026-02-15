import {
  BlobClient,
  BlockBlobClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';
import azureBlobConfig from '../config/azureBlob';
import { AppError } from '../middleware/errorHandler';
import pool from '../config/database';

/**
 * File types for different storage locations
 */
export enum FileType {
  LOGO = 'Logos',
  INVOICE = 'Invoices',
  EXPENSE = 'Expense',
  CLIENT_DOCUMENT = 'ClientDocuments',
  VENDOR_DOCUMENT = 'VendorDocuments',
  MONTHLY_REPORT = 'MonthlyReports',
  SIGNATURES = 'Signatures',
}

/**
 * Interface for file metadata stored in database
 */
export interface FileMetadata {
  id?: number;
  fileName: string;
  filePath: string;
  fileSize?: number;
  mimeType?: string;
  relatedId: number; // User_ID, Client_ID, or Vendor_ID
  fileType: FileType;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Azure Blob Storage Service
 * Handles all file operations with Azure Blob Storage
 */
export class BlobStorageService {
  /**
   * Generate blob path based on file type and related ID
   */
  private static generateBlobPath(
    fileType: FileType,
    relatedId: number,
    fileName: string,
    month?: string, // Optional month parameter for monthly reports (format: YYYY-MM)
    expenseSubfolder?: 'Generated_pdfs' | 'Uploaded_Documents' // Optional subfolder for expenses
  ): string {
    // Remove any leading slashes or dots from fileName for security
    const sanitizedFileName = fileName.replace(/^[./\\]+/, '').replace(/\.\./g, '');
    
    // Monthly reports use month-based folder structure: MonthlyReports/{month}/{fileName}
    if (fileType === FileType.MONTHLY_REPORT && month) {
      return `${fileType}/${month}/${sanitizedFileName}`;
    }
    
    // Expenses use subfolder structure: Expense/{expenseSubfolder}/{relatedId}/{fileName}
    if (fileType === FileType.EXPENSE && expenseSubfolder) {
      return `${fileType}/${expenseSubfolder}/${relatedId}/${sanitizedFileName}`;
    }
    
    // Other file types use: {fileType}/{relatedId}/{fileName}
    return `${fileType}/${relatedId}/${sanitizedFileName}`;
  }

  /**
   * Get blob client for a specific path
   */
  private static getBlobClient(blobPath: string): BlobClient {
    if (!azureBlobConfig.isConfigured()) {
      throw new AppError('Azure Blob Storage is not configured', 500);
    }

    const containerClient = azureBlobConfig.getContainerClient();
    return containerClient.getBlobClient(blobPath);
  }

  /**
   * Get block blob client for upload operations
   */
  private static getBlockBlobClient(blobPath: string): BlockBlobClient {
    if (!azureBlobConfig.isConfigured()) {
      throw new AppError('Azure Blob Storage is not configured', 500);
    }

    const containerClient = azureBlobConfig.getContainerClient();
    return containerClient.getBlockBlobClient(blobPath);
  }

  /**
   * Upload a file to Azure Blob Storage
   * @param fileBuffer - File buffer to upload
   * @param fileName - Original file name
   * @param fileType - Type of file (determines folder structure)
   * @param relatedId - User_ID, Client_ID, or Vendor_ID (not used for MONTHLY_REPORT)
   * @param mimeType - MIME type of the file
   * @param month - Optional month parameter for monthly reports (format: YYYY-MM)
   * @param expenseSubfolder - Optional subfolder for expenses ('Generated_pdfs' or 'Uploaded_Documents')
   * @returns Blob path
   */
  public static async uploadFile(
    fileBuffer: Buffer,
    fileName: string,
    fileType: FileType,
    relatedId: number,
    mimeType?: string,
    month?: string,
    expenseSubfolder?: 'Generated_pdfs' | 'Uploaded_Documents'
  ): Promise<string> {
    try {
      // Ensure container exists
      await azureBlobConfig.ensureContainerExists();

      // Generate blob path
      const blobPath = this.generateBlobPath(fileType, relatedId, fileName, month, expenseSubfolder);

      // Get block blob client for upload
      const blockBlobClient = this.getBlockBlobClient(blobPath);

      // Upload file
      await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
        blobHTTPHeaders: {
          blobContentType: mimeType || 'application/octet-stream',
        },
      });

      return blobPath;
    } catch (error) {
      console.error('Error uploading file to Azure Blob:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to upload file to Azure Blob Storage', 500);
    }
  }

  /**
   * Download a file from Azure Blob Storage
   * @param blobPath - Path to the blob
   * @returns File buffer and metadata
   */
  public static async downloadFile(blobPath: string): Promise<{
    buffer: Buffer;
    contentType: string;
    contentLength: number;
  }> {
    try {
      const blobClient = this.getBlobClient(blobPath);

      // Check if blob exists
      const exists = await blobClient.exists();
      if (!exists) {
        throw new AppError('File not found in Azure Blob Storage', 404);
      }

      // Get blob properties
      const properties = await blobClient.getProperties();

      // Download blob
      const downloadResponse = await blobClient.download();
      const chunks: Buffer[] = [];

      if (downloadResponse.readableStreamBody) {
        for await (const chunk of downloadResponse.readableStreamBody) {
          // Convert chunk to Buffer if it's a string, otherwise use as-is
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
      }

      const buffer = Buffer.concat(chunks);

      return {
        buffer,
        contentType: properties.contentType || 'application/octet-stream',
        contentLength: properties.contentLength || buffer.length,
      };
    } catch (error) {
      console.error('Error downloading file from Azure Blob:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to download file from Azure Blob Storage', 500);
    }
  }

  /**
   * Delete a file from Azure Blob Storage
   * @param blobPath - Path to the blob
   */
  public static async deleteFile(blobPath: string): Promise<void> {
    try {
      const blobClient = this.getBlobClient(blobPath);

      // Check if blob exists
      const exists = await blobClient.exists();
      if (!exists) {
        console.warn(`File not found in Azure Blob Storage: ${blobPath}`);
        return; // Don't throw error if file doesn't exist
      }

      // Delete blob
      await blobClient.delete();
    } catch (error) {
      console.error('Error deleting file from Azure Blob:', error);
      // Don't throw error - allow deletion to continue even if blob deletion fails
      // This prevents orphaned database entries
    }
  }

  /**
   * Check if a file exists in Azure Blob Storage
   * @param blobPath - Path to the blob
   */
  public static async fileExists(blobPath: string): Promise<boolean> {
    try {
      const blobClient = this.getBlobClient(blobPath);
      return await blobClient.exists();
    } catch (error) {
      console.error('Error checking file existence:', error);
      return false;
    }
  }

  /**
   * Get a download URL for a blob (SAS URL or public URL)
   * @param blobPath - Path to the blob
   * @param expiresInMinutes - Minutes until URL expires (default: 60)
   * @returns URL string
   */
  public static async getDownloadUrl(
    blobPath: string,
    expiresInMinutes: number = 60
  ): Promise<string> {
    try {
      const blobClient = this.getBlobClient(blobPath);

      // Check if blob exists
      const exists = await blobClient.exists();
      if (!exists) {
        throw new AppError('File not found in Azure Blob Storage', 404);
      }

      // Generate SAS URL (required for private container access)
      const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
      const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
      const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

      if (!accountName || !accountKey) {
        // Try to extract from connection string if available
        if (connectionString) {
          const accountNameMatch = connectionString.match(/AccountName=([^;]+)/);
          const accountKeyMatch = connectionString.match(/AccountKey=([^;]+)/);
          if (accountNameMatch && accountKeyMatch) {
            const extractedAccountName = accountNameMatch[1];
            const extractedAccountKey = accountKeyMatch[1];
            const sharedKeyCredential = new StorageSharedKeyCredential(extractedAccountName, extractedAccountKey);
            const sasOptions = {
              containerName: azureBlobConfig.getContainerName(),
              blobName: blobPath,
              permissions: BlobSASPermissions.parse('r'), // Read only
              startsOn: new Date(),
              expiresOn: new Date(new Date().valueOf() + expiresInMinutes * 60 * 1000),
            };
            const sasToken = generateBlobSASQueryParameters(sasOptions, sharedKeyCredential).toString();
            return `${blobClient.url}?${sasToken}`;
          }
        }
        throw new AppError('Azure Storage credentials not configured for SAS URL generation', 500);
      }

      const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
      const sasOptions = {
        containerName: azureBlobConfig.getContainerName(),
        blobName: blobPath,
        permissions: BlobSASPermissions.parse('r'), // Read only
        startsOn: new Date(),
        expiresOn: new Date(new Date().valueOf() + expiresInMinutes * 60 * 1000),
      };

      const sasToken = generateBlobSASQueryParameters(sasOptions, sharedKeyCredential).toString();
      return `${blobClient.url}?${sasToken}`;
    } catch (error) {
      console.error('Error generating download URL:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to generate download URL', 500);
    }
  }

  /**
   * Validate that a related ID exists in the database
   */
  public static async validateRelatedId(
    fileType: FileType,
    relatedId: number,
    userId?: number
  ): Promise<boolean> {
    const client = await pool.connect();

    try {
      switch (fileType) {
        case FileType.LOGO:
        case FileType.INVOICE:
        case FileType.EXPENSE:
          // For user-related files, validate user exists
          const userResult = await client.query('SELECT id FROM users WHERE id = $1', [relatedId]);
          if (userResult.rows.length === 0) {
            throw new AppError('User not found', 404);
          }
          // If userId is provided, ensure it matches
          if (userId && userId !== relatedId) {
            throw new AppError('Unauthorized: User ID mismatch', 403);
          }
          return true;

        case FileType.CLIENT_DOCUMENT:
          // Validate client exists and belongs to user
          const clientResult = await client.query(
            'SELECT id FROM master_clients WHERE id = $1 AND "userId" = $2',
            [relatedId, userId]
          );
          if (clientResult.rows.length === 0) {
            throw new AppError('Client not found or unauthorized', 404);
          }
          return true;

        case FileType.VENDOR_DOCUMENT:
          // Validate vendor exists and belongs to user
          const vendorResult = await client.query(
            'SELECT id FROM vendors WHERE id = $1 AND "userId" = $2',
            [relatedId, userId]
          );
          if (vendorResult.rows.length === 0) {
            throw new AppError('Vendor not found or unauthorized', 404);
          }
          return true;

        case FileType.SIGNATURES:
          // For signatures, relatedId is projectId - validate project exists and belongs to user
          if (!userId) {
            throw new AppError('User ID required for signature validation', 400);
          }
          const projectResult = await client.query(
            'SELECT id FROM projects WHERE id = $1 AND "userId" = $2',
            [relatedId, userId]
          );
          if (projectResult.rows.length === 0) {
            throw new AppError('Project not found or unauthorized', 404);
          }
          return true;

        default:
          throw new AppError('Invalid file type', 400);
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      console.error('Error validating related ID:', error);
      throw new AppError('Failed to validate related ID', 500);
    } finally {
      client.release();
    }
  }
}

export default BlobStorageService;

