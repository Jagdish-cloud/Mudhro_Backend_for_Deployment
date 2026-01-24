import pool from '../config/database';
import { AppError } from '../middleware/errorHandler';
import {
  VendorNote,
  VendorNoteCreateData,
  VendorNoteUpdateData,
  VendorNoteResponse,
} from '../types/vendorNote';

/**
 * Create a new vendor note
 */
export const createVendorNote = async (
  vendorId: number,
  userId: number,
  noteData: VendorNoteCreateData
): Promise<VendorNoteResponse> => {
  const client = await pool.connect();

  try {
    // Verify vendor belongs to user
    const vendorCheck = await client.query(
      'SELECT id FROM vendors WHERE id = $1 AND "userId" = $2',
      [vendorId, userId]
    );

    if (vendorCheck.rows.length === 0) {
      throw new AppError('Vendor not found', 404);
    }

    const result = await client.query(
      `INSERT INTO vendor_notes (
        "vendorId", "userId", note,
        "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING 
        id, "vendorId", "userId", note, "createdAt", "updatedAt"`,
      [vendorId, userId, noteData.note]
    );

    return mapVendorNoteToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error creating vendor note:', error);
    throw new AppError('Failed to create vendor note', 500);
  } finally {
    client.release();
  }
};

/**
 * Get all notes for a vendor (ordered by newest first)
 */
export const getVendorNotes = async (
  vendorId: number,
  userId: number
): Promise<VendorNoteResponse[]> => {
  const client = await pool.connect();

  try {
    // Verify vendor belongs to user
    const vendorCheck = await client.query(
      'SELECT id FROM vendors WHERE id = $1 AND "userId" = $2',
      [vendorId, userId]
    );

    if (vendorCheck.rows.length === 0) {
      throw new AppError('Vendor not found', 404);
    }

    const result = await client.query(
      `SELECT 
        id, "vendorId", "userId", note, "createdAt", "updatedAt"
      FROM vendor_notes 
      WHERE "vendorId" = $1 AND "userId" = $2
      ORDER BY "createdAt" DESC`,
      [vendorId, userId]
    );

    return result.rows.map(mapVendorNoteToResponse);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error fetching vendor notes:', error);
    throw new AppError('Failed to fetch vendor notes', 500);
  } finally {
    client.release();
  }
};

/**
 * Get the latest note for a vendor
 */
export const getLatestVendorNote = async (
  vendorId: number,
  userId: number
): Promise<VendorNoteResponse | null> => {
  const client = await pool.connect();

  try {
    // Verify vendor belongs to user
    const vendorCheck = await client.query(
      'SELECT id FROM vendors WHERE id = $1 AND "userId" = $2',
      [vendorId, userId]
    );

    if (vendorCheck.rows.length === 0) {
      throw new AppError('Vendor not found', 404);
    }

    const result = await client.query(
      `SELECT 
        id, "vendorId", "userId", note, "createdAt", "updatedAt"
      FROM vendor_notes 
      WHERE "vendorId" = $1 AND "userId" = $2
      ORDER BY "createdAt" DESC
      LIMIT 1`,
      [vendorId, userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapVendorNoteToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error fetching latest vendor note:', error);
    throw new AppError('Failed to fetch latest vendor note', 500);
  } finally {
    client.release();
  }
};

/**
 * Get a specific vendor note by ID
 */
export const getVendorNoteById = async (
  noteId: number,
  userId: number
): Promise<VendorNoteResponse> => {
  const client = await pool.connect();

  try {
    // Get note and verify it belongs to user's vendor
    const result = await client.query(
      `SELECT vn.id, vn."vendorId", vn."userId", vn.note, vn."createdAt", vn."updatedAt"
       FROM vendor_notes vn
       INNER JOIN vendors v ON vn."vendorId" = v.id
       WHERE vn.id = $1 AND v."userId" = $2`,
      [noteId, userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Vendor note not found', 404);
    }

    return mapVendorNoteToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error fetching vendor note:', error);
    throw new AppError('Failed to fetch vendor note', 500);
  } finally {
    client.release();
  }
};

/**
 * Update a vendor note
 */
export const updateVendorNote = async (
  noteId: number,
  userId: number,
  updateData: VendorNoteUpdateData
): Promise<VendorNoteResponse> => {
  const client = await pool.connect();

  try {
    // Verify note exists and belongs to user's vendor
    const noteCheck = await client.query(
      `SELECT vn.id
       FROM vendor_notes vn
       INNER JOIN vendors v ON vn."vendorId" = v.id
       WHERE vn.id = $1 AND v."userId" = $2`,
      [noteId, userId]
    );

    if (noteCheck.rows.length === 0) {
      throw new AppError('Vendor note not found', 404);
    }

    const result = await client.query(
      `UPDATE vendor_notes 
      SET note = $1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING 
        id, "vendorId", "userId", note, "createdAt", "updatedAt"`,
      [updateData.note, noteId]
    );

    return mapVendorNoteToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error updating vendor note:', error);
    throw new AppError('Failed to update vendor note', 500);
  } finally {
    client.release();
  }
};

/**
 * Delete a vendor note
 */
export const deleteVendorNote = async (
  noteId: number,
  userId: number
): Promise<void> => {
  const client = await pool.connect();

  try {
    // Verify note exists and belongs to user's vendor
    const noteCheck = await client.query(
      `SELECT vn.id
       FROM vendor_notes vn
       INNER JOIN vendors v ON vn."vendorId" = v.id
       WHERE vn.id = $1 AND v."userId" = $2`,
      [noteId, userId]
    );

    if (noteCheck.rows.length === 0) {
      throw new AppError('Vendor note not found', 404);
    }

    await client.query('DELETE FROM vendor_notes WHERE id = $1', [noteId]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error deleting vendor note:', error);
    throw new AppError('Failed to delete vendor note', 500);
  } finally {
    client.release();
  }
};

/**
 * Map database note to VendorNoteResponse
 */
const mapVendorNoteToResponse = (dbNote: any): VendorNoteResponse => {
  return {
    id: dbNote.id,
    vendorId: dbNote.vendorId,
    userId: dbNote.userId,
    note: dbNote.note,
    createdAt: new Date(dbNote.createdAt),
    updatedAt: new Date(dbNote.updatedAt),
  };
};

