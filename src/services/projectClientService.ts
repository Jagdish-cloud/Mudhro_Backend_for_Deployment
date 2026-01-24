import pool from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { MasterClientResponse } from '../types/masterClient';

/**
 * Add a client to a project
 */
export const addClientToProject = async (
  projectId: number,
  clientId: number,
  userId: number
): Promise<void> => {
  const client = await pool.connect();

  try {
    // Verify project exists and belongs to user
    const projectCheck = await client.query(
      'SELECT id, "userId" FROM projects WHERE id = $1 AND "userId" = $2',
      [projectId, userId]
    );

    if (projectCheck.rows.length === 0) {
      throw new AppError('Project not found or does not belong to user', 404);
    }

    // Verify client exists and belongs to user
    const clientCheck = await client.query(
      'SELECT id, "userId" FROM master_clients WHERE id = $1 AND "userId" = $2',
      [clientId, userId]
    );

    if (clientCheck.rows.length === 0) {
      throw new AppError('Client not found or does not belong to user', 404);
    }

    // Insert into junction table (ON CONFLICT DO NOTHING if already exists)
    await client.query(
      `INSERT INTO project_clients ("projectId", "clientId", "userId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("projectId", "clientId") DO NOTHING`,
      [projectId, clientId, userId]
    );
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error adding client to project:', error);
    throw new AppError('Failed to add client to project', 500);
  } finally {
    client.release();
  }
};

/**
 * Remove a client from a project
 */
export const removeClientFromProject = async (
  projectId: number,
  clientId: number,
  userId: number
): Promise<void> => {
  const client = await pool.connect();

  try {
    // Verify project exists and belongs to user
    const projectCheck = await client.query(
      'SELECT id FROM projects WHERE id = $1 AND "userId" = $2',
      [projectId, userId]
    );

    if (projectCheck.rows.length === 0) {
      throw new AppError('Project not found or does not belong to user', 404);
    }

    // Verify client exists and belongs to user
    const clientCheck = await client.query(
      'SELECT id FROM master_clients WHERE id = $1 AND "userId" = $2',
      [clientId, userId]
    );

    if (clientCheck.rows.length === 0) {
      throw new AppError('Client not found or does not belong to user', 404);
    }

    // Delete from junction table
    const result = await client.query(
      `DELETE FROM project_clients 
       WHERE "projectId" = $1 AND "clientId" = $2 AND "userId" = $3`,
      [projectId, clientId, userId]
    );

    if (result.rowCount === 0) {
      throw new AppError('Client is not assigned to this project', 404);
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error removing client from project:', error);
    throw new AppError('Failed to remove client from project', 500);
  } finally {
    client.release();
  }
};

/**
 * Get all clients for a project (using junction table)
 */
export const getClientsByProjectId = async (
  projectId: number,
  userId: number
): Promise<MasterClientResponse[]> => {
  const client = await pool.connect();

  try {
    // Verify project exists and belongs to user
    const projectCheck = await client.query(
      'SELECT id FROM projects WHERE id = $1 AND "userId" = $2',
      [projectId, userId]
    );

    if (projectCheck.rows.length === 0) {
      throw new AppError('Project not found', 404);
    }

    // Get clients from junction table
    const result = await client.query(
      `SELECT 
        mc.id, mc.organization, mc."fullName", mc.email, mc."mobileNumber", mc.gstin, mc.pan, mc."isActive",
        mc."userId", mc."projectId", mc."createdAt", mc."updatedAt"
      FROM project_clients pc
      INNER JOIN master_clients mc ON mc.id = pc."clientId"
      WHERE pc."projectId" = $1 AND pc."userId" = $2
      ORDER BY mc."createdAt" DESC`,
      [projectId, userId]
    );

    return result.rows.map((row: any): MasterClientResponse => ({
      id: row.id,
      organization: row.organization,
      fullName: row.fullName,
      email: row.email,
      mobileNumber: row.mobileNumber,
      gstin: row.gstin,
      pan: row.pan,
      isActive: row.isActive !== undefined ? row.isActive : true,
      userId: row.userId,
      projectId: row.projectId || undefined, // Keep for backward compatibility
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error fetching clients for project:', error);
    throw new AppError('Failed to fetch clients for project', 500);
  } finally {
    client.release();
  }
};

/**
 * Get all projects for a client
 */
export const getProjectsByClientId = async (
  clientId: number,
  userId: number
): Promise<any[]> => {
  const client = await pool.connect();

  try {
    // Verify client exists and belongs to user
    const clientCheck = await client.query(
      'SELECT id FROM master_clients WHERE id = $1 AND "userId" = $2',
      [clientId, userId]
    );

    if (clientCheck.rows.length === 0) {
      throw new AppError('Client not found', 404);
    }

    // Get projects from junction table
    const result = await client.query(
      `SELECT 
        p.id, p.name, p.description, p."startDate", p."endDate", p.status, p.budget,
        p."userId", p."createdAt", p."updatedAt"
      FROM project_clients pc
      INNER JOIN projects p ON p.id = pc."projectId"
      WHERE pc."clientId" = $1 AND pc."userId" = $2
      ORDER BY p."createdAt" DESC`,
      [clientId, userId]
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      startDate: row.startDate ? new Date(row.startDate) : undefined,
      endDate: row.endDate ? new Date(row.endDate) : undefined,
      status: row.status || 'active',
      budget: row.budget ? parseFloat(row.budget) : undefined,
      userId: row.userId,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error fetching projects for client:', error);
    throw new AppError('Failed to fetch projects for client', 500);
  } finally {
    client.release();
  }
};

/**
 * Bulk assign clients to a project (replaces all existing assignments)
 */
export const assignClientsToProject = async (
  projectId: number,
  clientIds: number[],
  userId: number
): Promise<void> => {
  const dbClient = await pool.connect();

  try {
    // Verify project exists and belongs to user
    const projectCheck = await dbClient.query(
      'SELECT id FROM projects WHERE id = $1 AND "userId" = $2',
      [projectId, userId]
    );

    if (projectCheck.rows.length === 0) {
      throw new AppError('Project not found or does not belong to user', 404);
    }

    // Verify all clients exist and belong to user
    if (clientIds.length > 0) {
      const placeholders = clientIds.map((_, i) => `$${i + 1}`).join(', ');
      const clientCheck = await dbClient.query(
        `SELECT id FROM master_clients 
         WHERE id IN (${placeholders}) AND "userId" = $${clientIds.length + 1}`,
        [...clientIds, userId]
      );

      if (clientCheck.rows.length !== clientIds.length) {
        throw new AppError('One or more clients not found or do not belong to user', 404);
      }
    }

    // Begin transaction
    await dbClient.query('BEGIN');

    try {
      // Remove all existing assignments for this project
      await dbClient.query(
        `DELETE FROM project_clients 
         WHERE "projectId" = $1 AND "userId" = $2`,
        [projectId, userId]
      );

      // Insert new assignments
      if (clientIds.length > 0) {
        const values = clientIds
          .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
          .join(', ');

        const params: any[] = [];
        clientIds.forEach((clientId) => {
          params.push(projectId, clientId, userId);
        });

        await dbClient.query(
          `INSERT INTO project_clients ("projectId", "clientId", "userId", "createdAt", "updatedAt")
           VALUES ${values}
           ON CONFLICT ("projectId", "clientId") DO NOTHING`,
          params
        );
      }

      // Commit transaction
      await dbClient.query('COMMIT');
    } catch (error) {
      await dbClient.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error assigning clients to project:', error);
    throw new AppError('Failed to assign clients to project', 500);
  } finally {
    dbClient.release();
  }
};

/**
 * Remove all clients from a project
 */
export const removeAllClientsFromProject = async (
  projectId: number,
  userId: number
): Promise<void> => {
  const client = await pool.connect();

  try {
    // Verify project exists and belongs to user
    const projectCheck = await client.query(
      'SELECT id FROM projects WHERE id = $1 AND "userId" = $2',
      [projectId, userId]
    );

    if (projectCheck.rows.length === 0) {
      throw new AppError('Project not found or does not belong to user', 404);
    }

    // Delete all assignments for this project
    await client.query(
      `DELETE FROM project_clients 
       WHERE "projectId" = $1 AND "userId" = $2`,
      [projectId, userId]
    );
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error removing all clients from project:', error);
    throw new AppError('Failed to remove all clients from project', 500);
  } finally {
    client.release();
  }
};
