import pool from '../config/database';
import {
  InvoiceItem,
  InvoiceItemCreateData,
  InvoiceItemUpdateData,
  InvoiceItemResponse,
} from '../types/invoiceItem';
import { AppError } from '../middleware/errorHandler';

/**
 * Create a new invoice item
 */
export const createInvoiceItem = async (
  invoiceItemData: InvoiceItemCreateData & { invoiceId: number; userId: number }
): Promise<InvoiceItemResponse> => {
  const client = await pool.connect();

  try {
    // Verify invoice exists and belongs to user
    const invoiceCheck = await client.query(
      'SELECT id FROM invoices WHERE id = $1 AND "userId" = $2',
      [invoiceItemData.invoiceId, invoiceItemData.userId]
    );

    if (invoiceCheck.rows.length === 0) {
      throw new AppError('Invoice not found', 404);
    }

    // Verify item exists and belongs to user
    const itemCheck = await client.query(
      'SELECT id, name FROM items WHERE id = $1 AND "userId" = $2',
      [invoiceItemData.itemsId, invoiceItemData.userId]
    );

    if (itemCheck.rows.length === 0) {
      throw new AppError('Item not found', 404);
    }

    // Insert invoice item
    const result = await client.query(
      `INSERT INTO invoice_items ("invoiceId", "itemsId", quantity, "unitPrice", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, "invoiceId", "itemsId", quantity, "unitPrice", "createdAt", "updatedAt"`,
      [
        invoiceItemData.invoiceId,
        invoiceItemData.itemsId,
        invoiceItemData.quantity,
        invoiceItemData.unitPrice,
      ]
    );

    const invoiceItem = mapInvoiceItemToResponse(result.rows[0]);
    invoiceItem.itemName = itemCheck.rows[0].name;

    return invoiceItem;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error creating invoice item:', error);
    throw new AppError('Failed to create invoice item', 500);
  } finally {
    client.release();
  }
};

/**
 * Get all invoice items for an invoice
 */
export const getInvoiceItemsByInvoiceId = async (
  invoiceId: number,
  userId: number
): Promise<InvoiceItemResponse[]> => {
  const client = await pool.connect();

  try {
    // Verify invoice belongs to user
    const invoiceCheck = await client.query(
      'SELECT id FROM invoices WHERE id = $1 AND "userId" = $2',
      [invoiceId, userId]
    );

    if (invoiceCheck.rows.length === 0) {
      throw new AppError('Invoice not found', 404);
    }

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
    console.error('Error fetching invoice items:', error);
    throw new AppError('Failed to fetch invoice items', 500);
  } finally {
    client.release();
  }
};

/**
 * Get invoice item by ID
 */
export const getInvoiceItemById = async (
  invoiceItemId: number,
  userId: number
): Promise<InvoiceItemResponse> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT 
        ii.id, ii."invoiceId", ii."itemsId", ii.quantity, ii."unitPrice",
        ii."createdAt", ii."updatedAt", i.name as "itemName"
      FROM invoice_items ii
      INNER JOIN items i ON ii."itemsId" = i.id
      INNER JOIN invoices inv ON ii."invoiceId" = inv.id
      WHERE ii.id = $1 AND inv."userId" = $2`,
      [invoiceItemId, userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Invoice item not found', 404);
    }

    const row = result.rows[0];
    return {
      id: row.id,
      invoiceId: row.invoiceId,
      itemsId: row.itemsId,
      quantity: parseFloat(row.quantity),
      unitPrice: parseFloat(row.unitPrice),
      itemName: row.itemName,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to retrieve invoice item', 500);
  } finally {
    client.release();
  }
};

/**
 * Update invoice item
 */
export const updateInvoiceItem = async (
  invoiceItemId: number,
  userId: number,
  updateData: InvoiceItemUpdateData
): Promise<InvoiceItemResponse> => {
  const client = await pool.connect();

  try {
    // Verify invoice item exists and belongs to user's invoice
    const existingCheck = await client.query(
      `SELECT ii.id FROM invoice_items ii
      INNER JOIN invoices inv ON ii."invoiceId" = inv.id
      WHERE ii.id = $1 AND inv."userId" = $2`,
      [invoiceItemId, userId]
    );

    if (existingCheck.rows.length === 0) {
      throw new AppError('Invoice item not found', 404);
    }

    // Build dynamic update query
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updateData.quantity !== undefined) {
      updateFields.push(`quantity = $${paramIndex}`);
      values.push(updateData.quantity);
      paramIndex++;
    }
    if (updateData.unitPrice !== undefined) {
      updateFields.push(`"unitPrice" = $${paramIndex}`);
      values.push(updateData.unitPrice);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    values.push(invoiceItemId);

    const result = await client.query(
      `UPDATE invoice_items 
      SET ${updateFields.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING id, "invoiceId", "itemsId", quantity, "unitPrice", "createdAt", "updatedAt"`,
      values
    );

    // Get item name
    const itemResult = await client.query(
      'SELECT name FROM items WHERE id = $1',
      [result.rows[0].itemsId]
    );

    const invoiceItem = mapInvoiceItemToResponse(result.rows[0]);
    invoiceItem.itemName = itemResult.rows[0]?.name;

    return invoiceItem;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error updating invoice item:', error);
    throw new AppError('Failed to update invoice item', 500);
  } finally {
    client.release();
  }
};

/**
 * Delete invoice item
 */
export const deleteInvoiceItem = async (
  invoiceItemId: number,
  userId: number
): Promise<void> => {
  const client = await pool.connect();

  try {
    // Verify invoice item exists and belongs to user's invoice
    const existingCheck = await client.query(
      `SELECT ii.id FROM invoice_items ii
      INNER JOIN invoices inv ON ii."invoiceId" = inv.id
      WHERE ii.id = $1 AND inv."userId" = $2`,
      [invoiceItemId, userId]
    );

    if (existingCheck.rows.length === 0) {
      throw new AppError('Invoice item not found', 404);
    }

    await client.query('DELETE FROM invoice_items WHERE id = $1', [invoiceItemId]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error deleting invoice item:', error);
    throw new AppError('Failed to delete invoice item', 500);
  } finally {
    client.release();
  }
};

/**
 * Map database invoice item to response DTO
 */
const mapInvoiceItemToResponse = (dbItem: any): InvoiceItemResponse => {
  return {
    id: dbItem.id,
    invoiceId: dbItem.invoiceId,
    itemsId: dbItem.itemsId,
    quantity: parseFloat(dbItem.quantity),
    unitPrice: parseFloat(dbItem.unitPrice),
    createdAt: new Date(dbItem.createdAt),
    updatedAt: new Date(dbItem.updatedAt),
  };
};

