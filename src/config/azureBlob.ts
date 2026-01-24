import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Azure Blob Storage Configuration
 * Reads credentials from environment variables
 */
export class AzureBlobConfig {
  private static instance: AzureBlobConfig;
  private blobServiceClient: BlobServiceClient | null = null;
  private containerName: string;

  private constructor() {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
    this.containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'mudhro-files';

    if (!connectionString && (!accountName || !accountKey)) {
      console.error('❌ Azure Blob Storage credentials not found. File storage is required.');
      console.error('   Please set AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME + AZURE_STORAGE_ACCOUNT_KEY');
      throw new Error('Azure Blob Storage credentials are required');
    }

    try {
      if (connectionString) {
        this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      } else if (accountName && accountKey) {
        const accountUrl = `https://${accountName}.blob.core.windows.net`;
        const { StorageSharedKeyCredential } = require('@azure/storage-blob');
        const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
        this.blobServiceClient = new BlobServiceClient(accountUrl, sharedKeyCredential);
      }

      if (this.blobServiceClient) {
        console.log('✅ Azure Blob Storage client initialized');
      } else {
        throw new Error('Failed to initialize Azure Blob Storage client');
      }
    } catch (error) {
      console.error('❌ Failed to initialize Azure Blob Storage:', error);
      throw error;
    }
  }

  public static getInstance(): AzureBlobConfig {
    if (!AzureBlobConfig.instance) {
      AzureBlobConfig.instance = new AzureBlobConfig();
    }
    return AzureBlobConfig.instance;
  }

  public getBlobServiceClient(): BlobServiceClient {
    if (!this.blobServiceClient) {
      throw new Error('Azure Blob Storage is not configured. Please set environment variables.');
    }
    return this.blobServiceClient;
  }

  public getContainerName(): string {
    return this.containerName;
  }

  public getContainerClient(): ContainerClient {
    const client = this.getBlobServiceClient();
    return client.getContainerClient(this.containerName);
  }

  /**
   * Ensure container exists, create if it doesn't
   * Container is private - access via SAS URLs only
   */
  public async ensureContainerExists(): Promise<void> {
    try {
      const containerClient = this.getContainerClient();
      // Create container without public access - all access via authenticated SDK or SAS
      await containerClient.createIfNotExists();
    } catch (error) {
      console.error('Failed to ensure container exists:', error);
      throw error;
    }
  }

  /**
   * Check if Azure Blob Storage is configured
   */
  public isConfigured(): boolean {
    return this.blobServiceClient !== null;
  }
}

export default AzureBlobConfig.getInstance();

