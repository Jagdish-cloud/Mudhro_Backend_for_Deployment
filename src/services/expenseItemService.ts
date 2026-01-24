import pool from '../config/database';
import {
  ExpenseItemCreateData,
  ExpenseItemResponse,
  ExpenseItemUpdateData,
} from '../types/expenseItem';
import { AppError } from '../middleware/errorHandler';

export const createExpenseItem = async (
  expenseItemData: ExpenseItemCreateData & { expenseId: number; userId: number }
): Promise<ExpenseItemResponse> => {
  const client = await pool.connect();

  try {
    const expenseCheck = await client.query(
      'SELECT id FROM expenses WHERE id = $1 AND "userId" = $2',
      [expenseItemData.expenseId, expenseItemData.userId]
    );

    if (expenseCheck.rows.length === 0) {
      throw new AppError('Expense not found', 404);
    }

    const serviceCheck = await client.query(
      'SELECT id, name FROM expense_service WHERE id = $1 AND "userId" = $2',
      [expenseItemData.serviceId, expenseItemData.userId]
    );

    if (serviceCheck.rows.length === 0) {
      throw new AppError('Expense service not found', 404);
    }

    const result = await client.query(
      `INSERT INTO expense_items ("expenseId", "serviceId", quantity, "unitPrice", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, "expenseId", "serviceId", quantity, "unitPrice", "createdAt", "updatedAt"`,
      [
        expenseItemData.expenseId,
        expenseItemData.serviceId,
        expenseItemData.quantity,
        expenseItemData.unitPrice,
      ]
    );

    const expenseItem = mapExpenseItemToResponse(result.rows[0]);
    expenseItem.serviceName = serviceCheck.rows[0].name;

    return expenseItem;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error creating expense item:', error);
    throw new AppError('Failed to create expense item', 500);
  } finally {
    client.release();
  }
};

export const getExpenseItemsByExpenseId = async (
  expenseId: number,
  userId: number
): Promise<ExpenseItemResponse[]> => {
  const client = await pool.connect();

  try {
    const expenseCheck = await client.query(
      'SELECT id FROM expenses WHERE id = $1 AND "userId" = $2',
      [expenseId, userId]
    );

    if (expenseCheck.rows.length === 0) {
      throw new AppError('Expense not found', 404);
    }

    // Use LEFT JOIN to return expense items even if the service was deleted
    const result = await client.query(
      `SELECT 
        ei.id, ei."expenseId", ei."serviceId", ei.quantity, ei."unitPrice",
        ei."createdAt", ei."updatedAt", s.name as "serviceName"
      FROM expense_items ei
      LEFT JOIN expense_service s ON ei."serviceId" = s.id
      WHERE ei."expenseId" = $1
      ORDER BY ei."createdAt" ASC`,
      [expenseId]
    );

    console.log(`[ExpenseItemService] Found ${result.rows.length} expense items for expense ${expenseId}`);

    return result.rows.map((row) => ({
      id: row.id,
      expenseId: row.expenseId,
      serviceId: row.serviceId,
      quantity: parseFloat(row.quantity),
      unitPrice: parseFloat(row.unitPrice),
      serviceName: row.serviceName || `Service ${row.serviceId || 'Unknown'}`,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error fetching expense items:', error);
    throw new AppError('Failed to fetch expense items', 500);
  } finally {
    client.release();
  }
};

export const getExpenseItemById = async (
  expenseItemId: number,
  userId: number
): Promise<ExpenseItemResponse> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT 
        ei.id, ei."expenseId", ei."serviceId", ei.quantity, ei."unitPrice",
        ei."createdAt", ei."updatedAt", s.name as "serviceName"
      FROM expense_items ei
      INNER JOIN expense_service s ON ei."serviceId" = s.id
      INNER JOIN expenses e ON ei."expenseId" = e.id
      WHERE ei.id = $1 AND e."userId" = $2`,
      [expenseItemId, userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Expense item not found', 404);
    }

    const row = result.rows[0];
    return {
      id: row.id,
      expenseId: row.expenseId,
      serviceId: row.serviceId,
      quantity: parseFloat(row.quantity),
      unitPrice: parseFloat(row.unitPrice),
      serviceName: row.serviceName,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to retrieve expense item', 500);
  } finally {
    client.release();
  }
};

export const updateExpenseItem = async (
  expenseItemId: number,
  userId: number,
  updateData: ExpenseItemUpdateData
): Promise<ExpenseItemResponse> => {
  const client = await pool.connect();

  try {
    const existingCheck = await client.query(
      `SELECT ei.id FROM expense_items ei
      INNER JOIN expenses e ON ei."expenseId" = e.id
      WHERE ei.id = $1 AND e."userId" = $2`,
      [expenseItemId, userId]
    );

    if (existingCheck.rows.length === 0) {
      throw new AppError('Expense item not found', 404);
    }

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

    values.push(expenseItemId);

    const result = await client.query(
      `UPDATE expense_items 
      SET ${updateFields.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING id, "expenseId", "serviceId", quantity, "unitPrice", "createdAt", "updatedAt"`,
      values
    );

    const serviceResult = await client.query(
      'SELECT name FROM expense_service WHERE id = $1',
      [result.rows[0].serviceId]
    );

    const expenseItem = mapExpenseItemToResponse(result.rows[0]);
    expenseItem.serviceName = serviceResult.rows[0]?.name;

    return expenseItem;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error updating expense item:', error);
    throw new AppError('Failed to update expense item', 500);
  } finally {
    client.release();
  }
};

export const deleteExpenseItem = async (
  expenseItemId: number,
  userId: number
): Promise<void> => {
  const client = await pool.connect();

  try {
    const existingCheck = await client.query(
      `SELECT ei.id FROM expense_items ei
      INNER JOIN expenses e ON ei."expenseId" = e.id
      WHERE ei.id = $1 AND e."userId" = $2`,
      [expenseItemId, userId]
    );

    if (existingCheck.rows.length === 0) {
      throw new AppError('Expense item not found', 404);
    }

    await client.query('DELETE FROM expense_items WHERE id = $1', [expenseItemId]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error deleting expense item:', error);
    throw new AppError('Failed to delete expense item', 500);
  } finally {
    client.release();
  }
};

const mapExpenseItemToResponse = (dbItem: any): ExpenseItemResponse => ({
  id: dbItem.id,
  expenseId: dbItem.expenseId,
  serviceId: dbItem.serviceId,
  quantity: parseFloat(dbItem.quantity),
  unitPrice: parseFloat(dbItem.unitPrice),
  serviceName: dbItem.serviceName ?? undefined,
  createdAt: new Date(dbItem.createdAt),
  updatedAt: new Date(dbItem.updatedAt),
});