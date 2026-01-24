import pool from '../config/database';
import {
  ExpenseServiceCreateData,
  ExpenseServiceResponse,
  ExpenseServiceUpdateData,
} from '../types/expenseService';
import { AppError } from '../middleware/errorHandler';

export const createExpenseService = async (
  data: ExpenseServiceCreateData
): Promise<ExpenseServiceResponse> => {
  const client = await pool.connect();

  try {
    const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [data.userId]);
    if (userCheck.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    const existing = await client.query(
      'SELECT id FROM expense_service WHERE LOWER(name) = LOWER($1) AND "userId" = $2',
      [data.name, data.userId]
    );
    if (existing.rows.length > 0) {
      throw new AppError('Expense service with this name already exists', 409);
    }

    const result = await client.query(
      `INSERT INTO expense_service (
        name, description, "defaultRate", "userId", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, name, description, "defaultRate", "userId", "createdAt", "updatedAt"`,
      [
        data.name,
        data.description ?? null,
        data.defaultRate ?? 0,
        data.userId,
      ]
    );

    return mapRow(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error creating expense service:', error);
    throw new AppError('Failed to create expense service', 500);
  } finally {
    client.release();
  }
};

export const getExpenseServicesByUserId = async (
  userId: number
): Promise<ExpenseServiceResponse[]> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT id, name, description, "defaultRate", "userId", "createdAt", "updatedAt"
       FROM expense_service
       WHERE "userId" = $1
       ORDER BY name ASC`,
      [userId]
    );
    return result.rows.map(mapRow);
  } catch (error) {
    console.error('Error fetching expense services:', error);
    throw new AppError('Failed to fetch expense services', 500);
  } finally {
    client.release();
  }
};

export const getExpenseServiceById = async (
  serviceId: number,
  userId: number
): Promise<ExpenseServiceResponse> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT id, name, description, "defaultRate", "userId", "createdAt", "updatedAt"
       FROM expense_service
       WHERE id = $1 AND "userId" = $2`,
      [serviceId, userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Expense service not found', 404);
    }

    return mapRow(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error fetching expense service:', error);
    throw new AppError('Failed to fetch expense service', 500);
  } finally {
    client.release();
  }
};

export const updateExpenseService = async (
  serviceId: number,
  userId: number,
  updateData: ExpenseServiceUpdateData
): Promise<ExpenseServiceResponse> => {
  const client = await pool.connect();

  try {
    const existing = await client.query(
      'SELECT id FROM expense_service WHERE id = $1 AND "userId" = $2',
      [serviceId, userId]
    );

    if (existing.rows.length === 0) {
      throw new AppError('Expense service not found', 404);
    }

    if (updateData.name) {
      const nameCheck = await client.query(
        'SELECT id FROM expense_service WHERE LOWER(name) = LOWER($1) AND "userId" = $2 AND id != $3',
        [updateData.name, userId, serviceId]
      );
      if (nameCheck.rows.length > 0) {
        throw new AppError('Expense service with this name already exists', 409);
      }
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (updateData.name !== undefined) {
      fields.push(`name = $${index++}`);
      values.push(updateData.name);
    }
    if (updateData.description !== undefined) {
      fields.push(`description = $${index++}`);
      values.push(updateData.description ?? null);
    }
    if (updateData.defaultRate !== undefined) {
      fields.push(`"defaultRate" = $${index++}`);
      values.push(updateData.defaultRate);
    }

    if (fields.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    values.push(serviceId, userId);

    const result = await client.query(
      `UPDATE expense_service
       SET ${fields.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $${index} AND "userId" = $${index + 1}
       RETURNING id, name, description, "defaultRate", "userId", "createdAt", "updatedAt"`,
      values
    );

    return mapRow(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error updating expense service:', error);
    throw new AppError('Failed to update expense service', 500);
  } finally {
    client.release();
  }
};

export const deleteExpenseService = async (
  serviceId: number,
  userId: number
): Promise<void> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      'DELETE FROM expense_service WHERE id = $1 AND "userId" = $2 RETURNING id',
      [serviceId, userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Expense service not found', 404);
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error deleting expense service:', error);
    throw new AppError('Failed to delete expense service', 500);
  } finally {
    client.release();
  }
};

const mapRow = (row: any): ExpenseServiceResponse => ({
  id: row.id,
  name: row.name,
  description: row.description ?? null,
  defaultRate: parseFloat(row.defaultRate),
  userId: row.userId,
  createdAt: new Date(row.createdAt),
  updatedAt: new Date(row.updatedAt),
});


