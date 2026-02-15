import pool from '../config/database';
import { InvoiceResponse } from '../types/invoice';
import { AppError } from '../middleware/errorHandler';
import BlobStorageService from './blobStorageService';

/**
 * Get client information (read-only, client-scoped)
 * CRITICAL: clientId must come from JWT, never from request body
 */
export const getClientInfo = async (
  clientId: number
): Promise<{ id: number; fullName: string; email: string; organization?: string }> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      'SELECT id, "fullName", email, organization FROM master_clients WHERE id = $1',
      [clientId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Client not found', 404);
    }

    return {
      id: result.rows[0].id,
      fullName: result.rows[0].fullName,
      email: result.rows[0].email,
      organization: result.rows[0].organization || undefined,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to retrieve client information', 500);
  } finally {
    client.release();
  }
};

/**
 * Get all invoices for a client (read-only, client-scoped)
 * CRITICAL: clientId must come from JWT, never from request body
 */
export const getClientInvoices = async (
  clientId: number
): Promise<InvoiceResponse[]> => {
  const client = await pool.connect();

  try {
    // Verify client exists
    const clientCheck = await client.query(
      'SELECT id FROM master_clients WHERE id = $1',
      [clientId]
    );

    if (clientCheck.rows.length === 0) {
      throw new AppError('Client not found', 404);
    }

    // Get all invoices for this client
    // CRITICAL: Only filter by clientId from JWT
    const result = await client.query(
      `SELECT 
        id, "userId", "clientId", "projectId", "invoiceNumber", "invoiceDate", "dueDate",
        "subTotalAmount", gst, "totalAmount", currency, "totalInstallments", 
        "currentInstallment", "additionalNotes", "paymentReminderRepetition", status,
        "paymentTerms", "advanceAmount", "balanceDue", "balanceDueDate",
        "createdAt", "updatedAt",
        invoice_file_name AS "invoiceFileName"
      FROM invoices 
      WHERE "clientId" = $1
      ORDER BY "invoiceDate" DESC, "createdAt" DESC`,
      [clientId]
    );

    return result.rows.map(mapInvoiceToResponse);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error fetching client invoices:', error);
    throw new AppError('Failed to fetch invoices', 500);
  } finally {
    client.release();
  }
};

/**
 * Get single invoice by ID for a client (read-only, client-scoped)
 * CRITICAL: clientId must come from JWT, ownership check enforced
 */
export const getClientInvoiceById = async (
  invoiceId: number,
  clientId: number
): Promise<InvoiceResponse> => {
  const client = await pool.connect();

  try {
    // Get invoice with ownership check
    // CRITICAL: Both invoiceId and clientId are required, clientId from JWT only
    const result = await client.query(
      `SELECT 
        id, "userId", "clientId", "projectId", "invoiceNumber", "invoiceDate", "dueDate",
        "subTotalAmount", gst, "totalAmount", currency, "totalInstallments", 
        "currentInstallment", "additionalNotes", "paymentReminderRepetition", status,
        "paymentTerms", "advanceAmount", "balanceDue", "balanceDueDate",
        "createdAt", "updatedAt",
        invoice_file_name AS "invoiceFileName"
      FROM invoices 
      WHERE id = $1 AND "clientId" = $2`,
      [invoiceId, clientId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Invoice not found or access denied', 404);
    }

    return mapInvoiceToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to retrieve invoice', 500);
  } finally {
    client.release();
  }
};

/**
 * Get invoice PDF for a client (read-only, client-scoped)
 * CRITICAL: clientId must come from JWT, ownership check enforced
 */
export const getClientInvoicePdf = async (
  invoiceId: number,
  clientId: number
): Promise<{ buffer: Buffer; fileName: string; contentType: string }> => {
  const client = await pool.connect();

  try {
    // First verify invoice exists and belongs to client
    const invoiceResult = await client.query(
      `SELECT 
        id, "invoiceNumber", invoice_file_name, "userId"
      FROM invoices 
      WHERE id = $1 AND "clientId" = $2`,
      [invoiceId, clientId]
    );

    if (invoiceResult.rows.length === 0) {
      throw new AppError('Invoice not found or access denied', 404);
    }

    const invoice = invoiceResult.rows[0];
    const userId = invoice.userId;

    // Determine file name
    const fileName =
      invoice.invoice_file_name && invoice.invoice_file_name.trim() !== ''
        ? invoice.invoice_file_name
        : invoice.invoiceNumber.endsWith('.pdf')
          ? invoice.invoiceNumber
          : `${invoice.invoiceNumber}.pdf`;

    // Download from Azure Blob Storage
    const blobPath = `Invoices/${userId}/${fileName}`;
    const fileData = await BlobStorageService.downloadFile(blobPath);

    return {
      buffer: fileData.buffer,
      fileName,
      contentType: fileData.contentType || 'application/pdf',
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error fetching client invoice PDF:', error);
    throw new AppError('Failed to retrieve invoice PDF', 500);
  } finally {
    client.release();
  }
};

/**
 * Get invoice items for a client (read-only, client-scoped)
 * CRITICAL: clientId must come from JWT, ownership check enforced
 */
export const getClientInvoiceItems = async (
  invoiceId: number,
  clientId: number
): Promise<Array<{
  id: number;
  invoiceId: number;
  itemsId: number;
  quantity: number;
  unitPrice: number;
  itemName: string;
  createdAt: Date;
  updatedAt: Date;
}>> => {
  const client = await pool.connect();

  try {
    // First verify invoice exists and belongs to client
    const invoiceCheck = await client.query(
      'SELECT id FROM invoices WHERE id = $1 AND "clientId" = $2',
      [invoiceId, clientId]
    );

    if (invoiceCheck.rows.length === 0) {
      throw new AppError('Invoice not found or access denied', 404);
    }

    // Get invoice items with item names
    const result = await client.query(
      `SELECT 
        ii.id, ii."invoiceId", ii."itemsId", ii.quantity, ii."unitPrice",
        ii."createdAt", ii."updatedAt", i.name as "itemName"
      FROM invoice_items ii
      INNER JOIN items i ON ii."itemsId" = i.id
      WHERE ii."invoiceId" = $1
      ORDER BY ii."createdAt" ASC`,
      [invoiceId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      invoiceId: row.invoiceId,
      itemsId: row.itemsId,
      quantity: parseFloat(row.quantity),
      unitPrice: parseFloat(row.unitPrice),
      itemName: row.itemName,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to retrieve invoice items', 500);
  } finally {
    client.release();
  }
};

/**
 * Map database invoice to response DTO (client-scoped, read-only)
 */
const mapInvoiceToResponse = (dbInvoice: any): InvoiceResponse => {
  return {
    id: dbInvoice.id,
    userId: dbInvoice.userId,
    clientId: dbInvoice.clientId,
    projectId: dbInvoice.projectId || null,
    invoiceNumber: dbInvoice.invoiceNumber,
    invoiceDate: new Date(dbInvoice.invoiceDate),
    dueDate: new Date(dbInvoice.dueDate),
    subTotalAmount: parseFloat(dbInvoice.subTotalAmount),
    gst: parseFloat(dbInvoice.gst),
    totalAmount: parseFloat(dbInvoice.totalAmount),
    currency: dbInvoice.currency || 'INR',
    totalInstallments: dbInvoice.totalInstallments,
    currentInstallment: dbInvoice.currentInstallment,
    additionalNotes: dbInvoice.additionalNotes,
    paymentReminderRepetition: dbInvoice.paymentReminderRepetition
      ? (typeof dbInvoice.paymentReminderRepetition === 'string'
          ? (() => {
              try {
                const parsed = JSON.parse(dbInvoice.paymentReminderRepetition);
                return Array.isArray(parsed) ? parsed : [parsed];
              } catch {
                // Fallback for old format (single string value)
                return [dbInvoice.paymentReminderRepetition];
              }
            })()
          : Array.isArray(dbInvoice.paymentReminderRepetition)
          ? dbInvoice.paymentReminderRepetition
          : [dbInvoice.paymentReminderRepetition])
      : null,
    status: dbInvoice.status || 'pending',
    paymentTerms: dbInvoice.paymentTerms || 'full',
    advanceAmount: dbInvoice.advanceAmount ? parseFloat(dbInvoice.advanceAmount) : null,
    balanceDue: dbInvoice.balanceDue ? parseFloat(dbInvoice.balanceDue) : null,
    balanceDueDate: dbInvoice.balanceDueDate ? new Date(dbInvoice.balanceDueDate) : null,
    invoiceFileName: dbInvoice.invoiceFileName,
    createdAt: new Date(dbInvoice.createdAt),
    updatedAt: new Date(dbInvoice.updatedAt),
  };
};
