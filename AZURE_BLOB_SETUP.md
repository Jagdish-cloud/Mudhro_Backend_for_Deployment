# Azure Blob Storage Setup Guide

This guide explains how to configure Azure Blob Storage for file storage in the Mudhro backend.

## Overview

The application uses Azure Blob Storage to store files in the following virtual folder structure:

- `Logos/{User_ID}/` - User logos
- `Invoices/{User_ID}/` - Invoice PDFs
- `Expenses/{User_ID}/` - Expense attachments
- `ClientDocuments/{Client_ID}/` - Client documents
- `VendorDocuments/{Vendor_ID}/` - Vendor documents

## Environment Variables

Add the following environment variables to your `.env` file in the `backend` directory:

### Option 1: Connection String (Recommended)

```env
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=your_account_name;AccountKey=your_account_key;EndpointSuffix=core.windows.net
AZURE_STORAGE_CONTAINER_NAME=mudhro-files
```

### Option 2: Account Name and Key

```env
AZURE_STORAGE_ACCOUNT_NAME=your_account_name
AZURE_STORAGE_ACCOUNT_KEY=your_account_key
AZURE_STORAGE_CONTAINER_NAME=mudhro-files
```

## Getting Azure Storage Credentials

1. **Create an Azure Storage Account** (if you don't have one):
   - Go to [Azure Portal](https://portal.azure.com)
   - Navigate to "Storage accounts"
   - Click "Create"
   - Fill in the required details
   - Click "Review + create"

2. **Get Connection String**:
   - Go to your Storage Account
   - Navigate to "Access keys" under "Security + networking"
   - Copy the "Connection string" from key1 or key2

3. **Get Account Name and Key**:
   - From the same "Access keys" page
   - Copy the "Storage account name"
   - Copy the "Key" value (click "Show" to reveal)

4. **Container Name**:
   - The container will be created automatically if it doesn't exist
   - Default name is `mudhro-files`
   - You can customize it using `AZURE_STORAGE_CONTAINER_NAME`

## Fallback Behavior

If Azure Blob Storage is not configured, the application will automatically fall back to local file storage in the following directories:

- `uploads/logos/` - User logos
- `Invoices/{User_ID}/` - Invoice PDFs
- `Expenses/{User_ID}/` - Expense attachments
- `ClientDocuments/{User_ID}/{Client_ID}/` - Client documents
- `VendorDocuments/{User_ID}/{Vendor_ID}/` - Vendor documents

## API Endpoints

### Upload File
```
POST /api/files/upload
Content-Type: multipart/form-data

Body:
- file: The file to upload
- fileType: Logos | Invoices | Expenses | ClientDocuments | VendorDocuments
- relatedId: User_ID, Client_ID, or Vendor_ID
- invoiceId: (optional, required for Invoices)
- expenseId: (optional, required for Expenses)
```

### Download File
```
GET /api/files/download/:fileType/:relatedId/:fileName?invoiceId=123&expenseId=456&documentId=789
```

### Delete File
```
DELETE /api/files/:fileType/:relatedId?invoiceId=123&expenseId=456&documentId=789
```

### Get Download URL (SAS URL)
```
GET /api/files/url/:fileType/:relatedId?invoiceId=123&expenseId=456&documentId=789&expiresInMinutes=60
```

## File Type Values

- `Logos` - User logos
- `Invoices` - Invoice PDFs
- `Expenses` - Expense attachments
- `ClientDocuments` - Client documents
- `VendorDocuments` - Vendor documents

## Security Notes

1. **Container Access**: The container is created with "blob" access level, meaning blobs are publicly readable but the container listing is private.

2. **SAS URLs**: For secure access, use the `/api/files/url` endpoint which generates time-limited SAS (Shared Access Signature) URLs.

3. **Authentication**: All file operations require authentication via JWT token.

4. **Authorization**: Users can only access files belonging to their own resources (users, clients, vendors).

## Troubleshooting

### "Azure Blob Storage is not configured" Warning

This warning appears if the environment variables are not set. The application will continue to work using local file storage.

### "Failed to upload file to Azure Blob Storage" Error

1. Check that your connection string or account credentials are correct
2. Verify that your Azure Storage Account is active
3. Check network connectivity to Azure
4. Verify that the container name is valid (lowercase, alphanumeric, hyphens)

### Files Not Appearing in Azure Portal

1. Check the container name in your environment variables
2. Verify that files are being uploaded (check server logs)
3. Ensure the container exists (it should be created automatically)

## Migration from Local Storage

If you're migrating from local storage to Azure Blob Storage:

1. Configure Azure Blob Storage environment variables
2. Existing files will remain in local storage
3. New files will be uploaded to Azure Blob Storage
4. The application can handle both storage types simultaneously

## Best Practices

1. **Use Connection String**: It's simpler and less error-prone than using account name and key separately
2. **Secure Your Keys**: Never commit `.env` files to version control
3. **Use SAS URLs**: For client-side downloads, use the `/api/files/url` endpoint to generate temporary URLs
4. **Monitor Storage**: Regularly check your Azure Storage usage and costs
5. **Backup**: Consider setting up Azure Blob Storage backup policies

