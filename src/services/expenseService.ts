import pool from '../config/database';
import BlobStorageService, { FileType } from './blobStorageService';
import {
  ExpenseCreateData,
  ExpenseResponse,
  ExpenseUpdateData,
} from '../types/expense';
import { AppError } from '../middleware/errorHandler';

/**
 * Create a new expense with line items
 */
export const createExpense = async (
  expenseData: ExpenseCreateData
): Promise<ExpenseResponse> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [
      expenseData.userId,
    ]);

    if (userCheck.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    const vendorCheck = await client.query(
      'SELECT id FROM vendors WHERE id = $1 AND "userId" = $2',
      [expenseData.vendorId, expenseData.userId]
    );

    if (vendorCheck.rows.length === 0) {
      throw new AppError('Vendor not found', 404);
    }

    const taxPercentage = expenseData.taxPercentage ?? 0;

    let subtotal = 0;
    if (expenseData.items && expenseData.items.length > 0) {
      subtotal = expenseData.items.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0
      );
    }

    if (subtotal === 0 && expenseData.totalAmount) {
      subtotal = taxPercentage > 0
        ? expenseData.totalAmount / (1 + taxPercentage / 100)
        : expenseData.totalAmount;
    }

    const totalAmount = expenseData.totalAmount ?? (subtotal + subtotal * (taxPercentage / 100));

    const result = await client.query(
      `INSERT INTO expenses (
        "userId", "vendorId", "billNumber", "billDate", "dueDate",
        "taxPercentage", "subTotalAmount", "totalAmount", "additionalNotes", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING 
        id, "userId", "vendorId", "billNumber", "billDate", "dueDate",
        "taxPercentage", "subTotalAmount", "totalAmount", "attachmentFileName", expense_file_name, "additionalNotes", "createdAt", "updatedAt"`,
      [
        expenseData.userId,
        expenseData.vendorId,
        expenseData.billNumber || null,
        expenseData.billDate,
        expenseData.dueDate,
        taxPercentage,
        subtotal,
        totalAmount,
        expenseData.additionalNotes || null,
      ]
    );

    const expense = result.rows[0];

    await client.query('COMMIT');

    return mapExpenseToResponse(expense);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error creating expense:', error);
    throw new AppError('Failed to create expense', 500);
  } finally {
    client.release();
  }
};

/**
 * Get all expenses for a user
 */
export const getExpensesByUserId = async (
  userId: number
): Promise<ExpenseResponse[]> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT 
        id, "userId", "vendorId", "billNumber", "billDate", "dueDate",
        "taxPercentage", "subTotalAmount", "totalAmount", "attachmentFileName", expense_file_name, "additionalNotes", "createdAt", "updatedAt"
      FROM expenses 
      WHERE "userId" = $1
      ORDER BY "billDate" DESC, "createdAt" DESC`,
      [userId]
    );

    return result.rows.map(mapExpenseToResponse);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    throw new AppError('Failed to fetch expenses', 500);
  } finally {
    client.release();
  }
};

/**
 * Get expense by ID
 */
export const getExpenseById = async (
  expenseId: number,
  userId: number
): Promise<ExpenseResponse> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT 
        id, "userId", "vendorId", "billNumber", "billDate", "dueDate",
        "taxPercentage", "subTotalAmount", "totalAmount", "attachmentFileName", expense_file_name, "additionalNotes", "createdAt", "updatedAt"
      FROM expenses 
      WHERE id = $1 AND "userId" = $2`,
      [expenseId, userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Expense not found', 404);
    }

    return mapExpenseToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to retrieve expense', 500);
  } finally {
    client.release();
  }
};

/**
 * Update expense
 */
export const updateExpense = async (
  expenseId: number,
  userId: number,
  updateData: ExpenseUpdateData
): Promise<ExpenseResponse> => {
  const client = await pool.connect();

  try {
    const existingExpense = await client.query(
      'SELECT id FROM expenses WHERE id = $1 AND "userId" = $2',
      [expenseId, userId]
    );

    if (existingExpense.rows.length === 0) {
      throw new AppError('Expense not found', 404);
    }

    if (updateData.vendorId) {
      const vendorCheck = await client.query(
        'SELECT id FROM vendors WHERE id = $1 AND "userId" = $2',
        [updateData.vendorId, userId]
      );

      if (vendorCheck.rows.length === 0) {
        throw new AppError('Vendor not found', 404);
      }
    }

    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updateData.vendorId !== undefined) {
      updateFields.push(`"vendorId" = $${paramIndex}`);
      values.push(updateData.vendorId);
      paramIndex++;
    }
    if (updateData.billNumber !== undefined) {
      updateFields.push(`"billNumber" = $${paramIndex}`);
      values.push(updateData.billNumber);
      paramIndex++;
    }
    if (updateData.billDate !== undefined) {
      updateFields.push(`"billDate" = $${paramIndex}`);
      values.push(updateData.billDate);
      paramIndex++;
    }
    if (updateData.dueDate !== undefined) {
      updateFields.push(`"dueDate" = $${paramIndex}`);
      values.push(updateData.dueDate);
      paramIndex++;
    }
    if (updateData.taxPercentage !== undefined) {
      updateFields.push(`"taxPercentage" = $${paramIndex}`);
      values.push(updateData.taxPercentage);
      paramIndex++;
    }
    if (updateData.subTotalAmount !== undefined) {
      updateFields.push(`"subTotalAmount" = $${paramIndex}`);
      values.push(updateData.subTotalAmount);
      paramIndex++;
    }
    if (updateData.totalAmount !== undefined) {
      updateFields.push(`"totalAmount" = $${paramIndex}`);
      values.push(updateData.totalAmount);
      paramIndex++;
    }
    if (updateData.additionalNotes !== undefined) {
      updateFields.push(`"additionalNotes" = $${paramIndex}`);
      values.push(updateData.additionalNotes);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    values.push(expenseId, userId);

    const result = await client.query(
      `UPDATE expenses 
      SET ${updateFields.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex} AND "userId" = $${paramIndex + 1}
      RETURNING 
        id, "userId", "vendorId", "billNumber", "billDate", "dueDate",
        "taxPercentage", "subTotalAmount", "totalAmount", "attachmentFileName", expense_file_name, "additionalNotes", "createdAt", "updatedAt"`,
      values
    );

    return mapExpenseToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error updating expense:', error);
    throw new AppError('Failed to update expense', 500);
  } finally {
    client.release();
  }
};

/**
 * Delete expense
 */
export const deleteExpense = async (
  expenseId: number,
  userId: number
): Promise<void> => {
  const client = await pool.connect();

  try {
    // Get expense file names before deleting
    const expenseResult = await client.query(
      `SELECT expense_file_name, "attachmentFileName" FROM expenses WHERE id = $1 AND "userId" = $2`,
      [expenseId, userId]
    );

    if (expenseResult.rows.length === 0) {
      throw new AppError('Expense not found', 404);
    }

    const expense = expenseResult.rows[0];

    // Delete expense from database
    await client.query(
      'DELETE FROM expenses WHERE id = $1 AND "userId" = $2',
      [expenseId, userId]
    );

    // Delete expense files from Azure Blob Storage if they exist
    if (expense.expense_file_name) {
      try {
        const blobPath = `Expenses/${userId}/${expense.expense_file_name}`;
        await BlobStorageService.deleteFile(blobPath);
      } catch (fileError: any) {
        // Log error but don't fail the deletion if file doesn't exist
        console.warn('Error deleting expense file from Azure Blob:', fileError);
      }
    }

    // Note: attachmentFileName is deprecated, but if it exists, delete it too
    if (expense.attachmentFileName) {
      try {
        const blobPath = `Expenses/${userId}/${expense.attachmentFileName}`;
        await BlobStorageService.deleteFile(blobPath);
      } catch (fileError: any) {
        // Log error but don't fail the deletion if file doesn't exist
        console.warn('Error deleting expense attachment from Azure Blob:', fileError);
      }
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error deleting expense:', error);
    throw new AppError('Failed to delete expense', 500);
  } finally {
    client.release();
  }
};

/**
 * Update expense attachment filename
 */
export const updateExpenseAttachmentFilename = async (
  expenseId: number,
  userId: number,
  attachmentFileName: string
): Promise<void> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `UPDATE expenses 
      SET "attachmentFileName" = $1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $2 AND "userId" = $3
      RETURNING id`,
      [attachmentFileName, expenseId, userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Expense not found', 404);
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error updating expense attachment filename:', error);
    throw new AppError('Failed to update expense attachment filename', 500);
  } finally {
    client.release();
  }
};

/**
 * Update expense PDF filename
 */
export const updateExpensePdfFilename = async (
  expenseId: number,
  userId: number,
  expenseFileName: string
): Promise<void> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `UPDATE expenses 
      SET expense_file_name = $1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $2 AND "userId" = $3
      RETURNING id`,
      [expenseFileName, expenseId, userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Expense not found', 404);
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error updating expense PDF filename:', error);
    throw new AppError('Failed to update expense PDF filename', 500);
  } finally {
    client.release();
  }
};

const mapExpenseToResponse = (dbExpense: any): ExpenseResponse => ({
  id: dbExpense.id,
  userId: dbExpense.userId,
  vendorId: dbExpense.vendorId,
  billNumber: dbExpense.billNumber,
  billDate: new Date(dbExpense.billDate),
  dueDate: new Date(dbExpense.dueDate),
  taxPercentage: parseFloat(dbExpense.taxPercentage || 0),
  subTotalAmount: parseFloat(dbExpense.subTotalAmount || 0),
  totalAmount: parseFloat(dbExpense.totalAmount || 0),
  attachmentFileName: dbExpense.attachmentFileName || null,
  expenseFileName: dbExpense.expense_file_name || null,
  additionalNotes: dbExpense.additionalNotes,
  createdAt: new Date(dbExpense.createdAt),
  updatedAt: new Date(dbExpense.updatedAt),
});


