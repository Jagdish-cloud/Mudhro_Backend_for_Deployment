import pool from '../config/database';
import { Item, ItemCreateData, ItemUpdateData, ItemResponse } from '../types/item';
import { AppError } from '../middleware/errorHandler';

/**
 * Create a new item
 */
export const createItem = async (itemData: ItemCreateData): Promise<ItemResponse> => {
  const client = await pool.connect();

  try {
    // Verify user exists
    const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [
      itemData.userId,
    ]);

    if (userCheck.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    // Insert item
    const result = await client.query(
      `INSERT INTO items (name, "userId", "createdAt", "updatedAt")
      VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, name, "userId", "createdAt", "updatedAt"`,
      [itemData.name, itemData.userId]
    );

    return mapItemToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error creating item:', error);
    throw new AppError('Failed to create item', 500);
  } finally {
    client.release();
  }
};

/**
 * Get all items for a user
 */
export const getItemsByUserId = async (userId: number): Promise<ItemResponse[]> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT id, name, "userId", "createdAt", "updatedAt"
      FROM items 
      WHERE "userId" = $1
      ORDER BY name ASC`,
      [userId]
    );

    return result.rows.map(mapItemToResponse);
  } catch (error) {
    console.error('Error fetching items:', error);
    throw new AppError('Failed to fetch items', 500);
  } finally {
    client.release();
  }
};

/**
 * Get item by ID
 */
export const getItemById = async (itemId: number, userId: number): Promise<ItemResponse> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT id, name, "userId", "createdAt", "updatedAt"
      FROM items 
      WHERE id = $1 AND "userId" = $2`,
      [itemId, userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Item not found', 404);
    }

    return mapItemToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to retrieve item', 500);
  } finally {
    client.release();
  }
};

/**
 * Update item
 */
export const updateItem = async (
  itemId: number,
  userId: number,
  updateData: ItemUpdateData
): Promise<ItemResponse> => {
  const client = await pool.connect();

  try {
    // Check if item exists and belongs to user
    const existingItem = await client.query(
      'SELECT id FROM items WHERE id = $1 AND "userId" = $2',
      [itemId, userId]
    );

    if (existingItem.rows.length === 0) {
      throw new AppError('Item not found', 404);
    }

    if (!updateData.name) {
      throw new AppError('Name is required for update', 400);
    }

    const result = await client.query(
      `UPDATE items 
      SET name = $1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $2 AND "userId" = $3
      RETURNING id, name, "userId", "createdAt", "updatedAt"`,
      [updateData.name, itemId, userId]
    );

    return mapItemToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error updating item:', error);
    throw new AppError('Failed to update item', 500);
  } finally {
    client.release();
  }
};

/**
 * Delete item
 */
export const deleteItem = async (itemId: number, userId: number): Promise<void> => {
  const client = await pool.connect();

  try {
    // Check if item is used in any invoice
    const usageCheck = await client.query(
      'SELECT id FROM invoice_items WHERE "itemsId" = $1 LIMIT 1',
      [itemId]
    );

    if (usageCheck.rows.length > 0) {
      throw new AppError(
        'Cannot delete item as it is used in one or more invoices',
        409
      );
    }

    const result = await client.query(
      'DELETE FROM items WHERE id = $1 AND "userId" = $2 RETURNING id',
      [itemId, userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Item not found', 404);
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error deleting item:', error);
    throw new AppError('Failed to delete item', 500);
  } finally {
    client.release();
  }
};

/**
 * Map database item to response DTO
 */
const mapItemToResponse = (dbItem: any): ItemResponse => {
  return {
    id: dbItem.id,
    name: dbItem.name,
    userId: dbItem.userId,
    createdAt: new Date(dbItem.createdAt),
    updatedAt: new Date(dbItem.updatedAt),
  };
};

