import path from 'path';
import { promises as fs } from 'fs';
import pool from '../config/database';
import {
  MasterClient,
  MasterClientCreateData,
  MasterClientUpdateData,
  MasterClientResponse,
} from '../types/masterClient';
import { AppError } from '../middleware/errorHandler';

/**
 * Create a new master client
 */
export const createMasterClient = async (
  clientData: MasterClientCreateData
): Promise<MasterClientResponse> => {
  const client = await pool.connect();

  try {
    // Verify user exists
    const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [
      clientData.userId,
    ]);

    if (userCheck.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    // Check if email already exists for this user
    const existingClient = await client.query(
      'SELECT id FROM master_clients WHERE email = $1 AND "userId" = $2',
      [clientData.email, clientData.userId]
    );

    if (existingClient.rows.length > 0) {
      throw new AppError(
        'Client with this email already exists for this user',
        409
      );
    }

    // Insert master client (projectId removed - use project_clients junction table instead)
    const result = await client.query(
      `INSERT INTO master_clients (
        organization, "fullName", email, "mobileNumber", gstin, pan, "isActive", "userId",
        "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING 
        id, organization, "fullName", email, "mobileNumber", gstin, pan, "isActive",
        "userId", "projectId", "createdAt", "updatedAt"`,
      [
        clientData.organization || null,
        clientData.fullName,
        clientData.email,
        clientData.mobileNumber || null,
        clientData.gstin || null,
        clientData.pan || null,
        clientData.isActive !== undefined ? clientData.isActive : true,
        clientData.userId,
      ]
    );

    return mapClientToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error creating master client:', error);
    throw new AppError('Failed to create master client', 500);
  } finally {
    client.release();
  }
};

/**
 * Get all master clients for a user
 * Note: projectId parameter is deprecated - use projectClientService.getClientsByProjectId instead
 */
export const getMasterClientsByUserId = async (
  userId: number,
  projectId?: number // Deprecated - kept for backward compatibility but ignored
): Promise<MasterClientResponse[]> => {
  const client = await pool.connect();

  try {
    // Note: projectId filtering removed - use project_clients junction table instead
    // For filtering by project, use projectClientService.getClientsByProjectId
    const result = await client.query(
      `SELECT 
        id, organization, "fullName", email, "mobileNumber", gstin, pan, "isActive",
        "userId", "projectId", "createdAt", "updatedAt"
      FROM master_clients 
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC`,
      [userId]
    );

    return result.rows.map(mapClientToResponse);
  } catch (error) {
    console.error('Error fetching master clients:', error);
    throw new AppError('Failed to fetch master clients', 500);
  } finally {
    client.release();
  }
};

/**
 * Get master client by ID
 */
export const getMasterClientById = async (
  clientId: number,
  userId: number
): Promise<MasterClientResponse> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT 
        id, organization, "fullName", email, "mobileNumber", gstin, pan, "isActive",
        "userId", "projectId", "createdAt", "updatedAt"
      FROM master_clients 
      WHERE id = $1 AND "userId" = $2`,
      [clientId, userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Master client not found', 404);
    }

    return mapClientToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to retrieve master client', 500);
  } finally {
    client.release();
  }
};

/**
 * Update master client
 */
export const updateMasterClient = async (
  clientId: number,
  userId: number,
  updateData: MasterClientUpdateData
): Promise<MasterClientResponse> => {
  const client = await pool.connect();

  try {
    // Check if client exists and belongs to user
    const existingClient = await client.query(
      'SELECT id FROM master_clients WHERE id = $1 AND "userId" = $2',
      [clientId, userId]
    );

    if (existingClient.rows.length === 0) {
      throw new AppError('Master client not found', 404);
    }

    // If email is being updated, check for duplicates
    if (updateData.email) {
      const emailCheck = await client.query(
        'SELECT id FROM master_clients WHERE email = $1 AND "userId" = $2 AND id != $3',
        [updateData.email, userId, clientId]
      );

      if (emailCheck.rows.length > 0) {
        throw new AppError(
          'Client with this email already exists for this user',
          409
        );
      }
    }

    // Note: projectId handling removed - use project_clients junction table instead
    // For managing project-client relationships, use projectClientService methods

    // Build dynamic update query
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updateData.organization !== undefined) {
      updateFields.push(`organization = $${paramIndex}`);
      values.push(updateData.organization || null);
      paramIndex++;
    }
    if (updateData.fullName !== undefined) {
      updateFields.push(`"fullName" = $${paramIndex}`);
      values.push(updateData.fullName);
      paramIndex++;
    }
    if (updateData.email !== undefined) {
      updateFields.push(`email = $${paramIndex}`);
      values.push(updateData.email);
      paramIndex++;
    }
    if (updateData.mobileNumber !== undefined) {
      updateFields.push(`"mobileNumber" = $${paramIndex}`);
      values.push(updateData.mobileNumber || null);
      paramIndex++;
    }
    if (updateData.gstin !== undefined) {
      updateFields.push(`gstin = $${paramIndex}`);
      values.push(updateData.gstin || null);
      paramIndex++;
    }
    if (updateData.pan !== undefined) {
      updateFields.push(`pan = $${paramIndex}`);
      values.push(updateData.pan || null);
      paramIndex++;
    }
    if (updateData.isActive !== undefined) {
      updateFields.push(`"isActive" = $${paramIndex}`);
      values.push(updateData.isActive);
      paramIndex++;
    }
    // Note: projectId removed - use project_clients junction table instead

    if (updateFields.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    values.push(clientId, userId);

    const result = await client.query(
      `UPDATE master_clients 
      SET ${updateFields.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex} AND "userId" = $${paramIndex + 1}
      RETURNING 
        id, organization, "fullName", email, "mobileNumber", gstin, pan, "isActive",
        "userId", "projectId", "createdAt", "updatedAt"`,
      values
    );

    return mapClientToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error updating master client:', error);
    throw new AppError('Failed to update master client', 500);
  } finally {
    client.release();
  }
};

/**
 * Delete master client
 */
export const deleteMasterClient = async (
  clientId: number,
  userId: number
): Promise<void> => {
  const client = await pool.connect();

  try {
    // Verify client exists and belongs to user
    const clientCheck = await client.query(
      'SELECT id FROM master_clients WHERE id = $1 AND "userId" = $2',
      [clientId, userId]
    );

    if (clientCheck.rows.length === 0) {
      throw new AppError('Master client not found', 404);
    }

    // Get all client documents before deleting
    const documentsResult = await client.query(
      'SELECT "filePath" FROM client_documents WHERE "clientId" = $1',
      [clientId]
    );

    // Delete client from database (documents will be deleted via CASCADE or we handle them)
    await client.query(
      'DELETE FROM master_clients WHERE id = $1 AND "userId" = $2',
      [clientId, userId]
    );

    // Delete all client document files
    for (const doc of documentsResult.rows) {
      try {
        const fullPath = path.join(process.cwd(), doc.filePath);
        await fs.unlink(fullPath);
      } catch (fileError: any) {
        if (fileError.code !== 'ENOENT') {
          console.error('Error deleting client document file:', fileError);
        }
      }
    }

    // Try to remove the client documents directory if empty
    try {
      const documentsRoot = path.join(process.cwd(), 'ClientDocuments', String(userId), String(clientId));
      await fs.rmdir(documentsRoot, { recursive: true });
    } catch (dirError: any) {
      // Ignore errors when removing directory
      if (dirError.code !== 'ENOENT') {
        console.warn('Error removing client documents directory:', dirError);
      }
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error deleting master client:', error);
    throw new AppError('Failed to delete master client', 500);
  } finally {
    client.release();
  }
};

/**
 * Map database client to response DTO
 */
const mapClientToResponse = (dbClient: any): MasterClientResponse => {
  return {
    id: dbClient.id,
    organization: dbClient.organization,
    fullName: dbClient.fullName,
    email: dbClient.email,
    mobileNumber: dbClient.mobileNumber,
    gstin: dbClient.gstin,
    pan: dbClient.pan,
    isActive: dbClient.isActive !== undefined ? dbClient.isActive : true,
    userId: dbClient.userId,
    projectId: dbClient.projectId || undefined,
    createdAt: new Date(dbClient.createdAt),
    updatedAt: new Date(dbClient.updatedAt),
  };
};

