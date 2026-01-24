import pool from '../config/database';
import { AppError } from '../middleware/errorHandler';
import {
  ClientNote,
  ClientNoteCreateData,
  ClientNoteUpdateData,
  ClientNoteResponse,
} from '../types/clientNote';

/**
 * Create a new client note
 */
export const createClientNote = async (
  clientId: number,
  userId: number,
  noteData: ClientNoteCreateData
): Promise<ClientNoteResponse> => {
  const client = await pool.connect();

  try {
    // Verify client belongs to user
    const clientCheck = await client.query(
      'SELECT id FROM master_clients WHERE id = $1 AND "userId" = $2',
      [clientId, userId]
    );

    if (clientCheck.rows.length === 0) {
      throw new AppError('Client not found', 404);
    }

    const result = await client.query(
      `INSERT INTO client_notes (
        "clientId", "userId", note,
        "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING 
        id, "clientId", "userId", note, "createdAt", "updatedAt"`,
      [clientId, userId, noteData.note]
    );

    return mapClientNoteToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error creating client note:', error);
    throw new AppError('Failed to create client note', 500);
  } finally {
    client.release();
  }
};

/**
 * Get all notes for a client (ordered by newest first)
 */
export const getClientNotes = async (
  clientId: number,
  userId: number
): Promise<ClientNoteResponse[]> => {
  const client = await pool.connect();

  try {
    // Verify client belongs to user
    const clientCheck = await client.query(
      'SELECT id FROM master_clients WHERE id = $1 AND "userId" = $2',
      [clientId, userId]
    );

    if (clientCheck.rows.length === 0) {
      throw new AppError('Client not found', 404);
    }

    const result = await client.query(
      `SELECT 
        id, "clientId", "userId", note, "createdAt", "updatedAt"
      FROM client_notes 
      WHERE "clientId" = $1 AND "userId" = $2
      ORDER BY "createdAt" DESC`,
      [clientId, userId]
    );

    return result.rows.map(mapClientNoteToResponse);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error fetching client notes:', error);
    throw new AppError('Failed to fetch client notes', 500);
  } finally {
    client.release();
  }
};

/**
 * Get the latest note for a client
 */
export const getLatestClientNote = async (
  clientId: number,
  userId: number
): Promise<ClientNoteResponse | null> => {
  const client = await pool.connect();

  try {
    // Verify client belongs to user
    const clientCheck = await client.query(
      'SELECT id FROM master_clients WHERE id = $1 AND "userId" = $2',
      [clientId, userId]
    );

    if (clientCheck.rows.length === 0) {
      throw new AppError('Client not found', 404);
    }

    const result = await client.query(
      `SELECT 
        id, "clientId", "userId", note, "createdAt", "updatedAt"
      FROM client_notes 
      WHERE "clientId" = $1 AND "userId" = $2
      ORDER BY "createdAt" DESC
      LIMIT 1`,
      [clientId, userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapClientNoteToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error fetching latest client note:', error);
    throw new AppError('Failed to fetch latest client note', 500);
  } finally {
    client.release();
  }
};

/**
 * Get a specific client note by ID
 */
export const getClientNoteById = async (
  noteId: number,
  userId: number
): Promise<ClientNoteResponse> => {
  const client = await pool.connect();

  try {
    // Get note and verify it belongs to user's client
    const result = await client.query(
      `SELECT cn.id, cn."clientId", cn."userId", cn.note, cn."createdAt", cn."updatedAt"
       FROM client_notes cn
       INNER JOIN master_clients mc ON cn."clientId" = mc.id
       WHERE cn.id = $1 AND mc."userId" = $2`,
      [noteId, userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Client note not found', 404);
    }

    return mapClientNoteToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error fetching client note:', error);
    throw new AppError('Failed to fetch client note', 500);
  } finally {
    client.release();
  }
};

/**
 * Update a client note
 */
export const updateClientNote = async (
  noteId: number,
  userId: number,
  updateData: ClientNoteUpdateData
): Promise<ClientNoteResponse> => {
  const client = await pool.connect();

  try {
    // Verify note exists and belongs to user's client
    const noteCheck = await client.query(
      `SELECT cn.id
       FROM client_notes cn
       INNER JOIN master_clients mc ON cn."clientId" = mc.id
       WHERE cn.id = $1 AND mc."userId" = $2`,
      [noteId, userId]
    );

    if (noteCheck.rows.length === 0) {
      throw new AppError('Client note not found', 404);
    }

    const result = await client.query(
      `UPDATE client_notes 
      SET note = $1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING 
        id, "clientId", "userId", note, "createdAt", "updatedAt"`,
      [updateData.note, noteId]
    );

    return mapClientNoteToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error updating client note:', error);
    throw new AppError('Failed to update client note', 500);
  } finally {
    client.release();
  }
};

/**
 * Delete a client note
 */
export const deleteClientNote = async (
  noteId: number,
  userId: number
): Promise<void> => {
  const client = await pool.connect();

  try {
    // Verify note exists and belongs to user's client
    const noteCheck = await client.query(
      `SELECT cn.id
       FROM client_notes cn
       INNER JOIN master_clients mc ON cn."clientId" = mc.id
       WHERE cn.id = $1 AND mc."userId" = $2`,
      [noteId, userId]
    );

    if (noteCheck.rows.length === 0) {
      throw new AppError('Client note not found', 404);
    }

    await client.query('DELETE FROM client_notes WHERE id = $1', [noteId]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error deleting client note:', error);
    throw new AppError('Failed to delete client note', 500);
  } finally {
    client.release();
  }
};

/**
 * Map database note to ClientNoteResponse
 */
const mapClientNoteToResponse = (dbNote: any): ClientNoteResponse => {
  return {
    id: dbNote.id,
    clientId: dbNote.clientId,
    userId: dbNote.userId,
    note: dbNote.note,
    createdAt: new Date(dbNote.createdAt),
    updatedAt: new Date(dbNote.updatedAt),
  };
};

