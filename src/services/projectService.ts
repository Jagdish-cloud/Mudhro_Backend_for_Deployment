import pool from '../config/database';
import {
  Project,
  ProjectCreateData,
  ProjectUpdateData,
  ProjectResponse,
} from '../types/project';
import { AppError } from '../middleware/errorHandler';

/**
 * Create a new project
 */
export const createProject = async (
  projectData: ProjectCreateData
): Promise<ProjectResponse> => {
  const client = await pool.connect();

  try {
    // Verify user exists
    const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [
      projectData.userId,
    ]);

    if (userCheck.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    // Validate dates if both are provided
    if (projectData.startDate && projectData.endDate) {
      const startDate = new Date(projectData.startDate);
      const endDate = new Date(projectData.endDate);
      if (endDate < startDate) {
        throw new AppError('End date must be after start date', 400);
      }
    }

    // Insert project
    const result = await client.query(
      `INSERT INTO projects (
        name, description, "startDate", "endDate", status, budget, "userId",
        "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING 
        id, name, description, "startDate", "endDate", status, budget,
        "userId", "createdAt", "updatedAt"`,
      [
        projectData.name,
        projectData.description || null,
        projectData.startDate || null,
        projectData.endDate || null,
        projectData.status || 'active',
        projectData.budget || null,
        projectData.userId,
      ]
    );

    return mapProjectToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error creating project:', error);
    throw new AppError('Failed to create project', 500);
  } finally {
    client.release();
  }
};

/**
 * Get all projects for a user
 */
export const getProjectsByUserId = async (
  userId: number
): Promise<ProjectResponse[]> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT 
        p.id, p.name, p.description, p."startDate", p."endDate", p.status, p.budget,
        p."userId", p."createdAt", p."updatedAt",
        COUNT(pc.id) as "clientCount"
      FROM projects p
      LEFT JOIN project_clients pc ON pc."projectId" = p.id
      WHERE p."userId" = $1
      GROUP BY p.id
      ORDER BY p."createdAt" DESC`,
      [userId]
    );

    return result.rows.map(mapProjectToResponse);
  } catch (error) {
    console.error('Error fetching projects:', error);
    throw new AppError('Failed to fetch projects', 500);
  } finally {
    client.release();
  }
};

/**
 * Get project by ID
 */
export const getProjectById = async (
  projectId: number,
  userId: number
): Promise<ProjectResponse> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT 
        p.id, p.name, p.description, p."startDate", p."endDate", p.status, p.budget,
        p."userId", p."createdAt", p."updatedAt",
        COUNT(pc.id) as "clientCount"
      FROM projects p
      LEFT JOIN project_clients pc ON pc."projectId" = p.id
      WHERE p.id = $1 AND p."userId" = $2
      GROUP BY p.id`,
      [projectId, userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Project not found', 404);
    }

    return mapProjectToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to retrieve project', 500);
  } finally {
    client.release();
  }
};

/**
 * Update project
 */
export const updateProject = async (
  projectId: number,
  userId: number,
  updateData: ProjectUpdateData
): Promise<ProjectResponse> => {
  const client = await pool.connect();

  try {
    // Check if project exists and belongs to user
    const existingProject = await client.query(
      'SELECT id FROM projects WHERE id = $1 AND "userId" = $2',
      [projectId, userId]
    );

    if (existingProject.rows.length === 0) {
      throw new AppError('Project not found', 404);
    }

    // Validate dates if both are provided
    if (updateData.startDate && updateData.endDate) {
      const startDate = new Date(updateData.startDate);
      const endDate = new Date(updateData.endDate);
      if (endDate < startDate) {
        throw new AppError('End date must be after start date', 400);
      }
    }

    // Build dynamic update query
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updateData.name !== undefined) {
      updateFields.push(`name = $${paramIndex}`);
      values.push(updateData.name);
      paramIndex++;
    }
    if (updateData.description !== undefined) {
      updateFields.push(`description = $${paramIndex}`);
      values.push(updateData.description || null);
      paramIndex++;
    }
    if (updateData.startDate !== undefined) {
      updateFields.push(`"startDate" = $${paramIndex}`);
      values.push(updateData.startDate || null);
      paramIndex++;
    }
    if (updateData.endDate !== undefined) {
      updateFields.push(`"endDate" = $${paramIndex}`);
      values.push(updateData.endDate || null);
      paramIndex++;
    }
    if (updateData.status !== undefined) {
      updateFields.push(`status = $${paramIndex}`);
      values.push(updateData.status);
      paramIndex++;
    }
    if (updateData.budget !== undefined) {
      updateFields.push(`budget = $${paramIndex}`);
      values.push(updateData.budget || null);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    values.push(projectId, userId);

    const result = await client.query(
      `UPDATE projects 
      SET ${updateFields.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex} AND "userId" = $${paramIndex + 1}
      RETURNING 
        id, name, description, "startDate", "endDate", status, budget,
        "userId", "createdAt", "updatedAt"`,
      values
    );

    return mapProjectToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error updating project:', error);
    throw new AppError('Failed to update project', 500);
  } finally {
    client.release();
  }
};

/**
 * Delete project
 */
export const deleteProject = async (
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
      throw new AppError('Project not found', 404);
    }

    // Remove all client assignments from project_clients junction table
    // (ON DELETE CASCADE handles this, but we do it explicitly for clarity)
    await client.query(
      'DELETE FROM project_clients WHERE "projectId" = $1 AND "userId" = $2',
      [projectId, userId]
    );

    // Delete project (project_clients entries will also be deleted via CASCADE)
    await client.query(
      'DELETE FROM projects WHERE id = $1 AND "userId" = $2',
      [projectId, userId]
    );
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error deleting project:', error);
    throw new AppError('Failed to delete project', 500);
  } finally {
    client.release();
  }
};

// Note: getClientsByProjectId has been moved to projectClientService.ts
// Import and use projectClientService.getClientsByProjectId instead

/**
 * Get project financial summary including invoices and expenses
 */
export interface ProjectFinancialSummary {
  projectId: number;
  totalInvoices: number;
  totalExpenses: number;
  profit: number;
  invoiceCount: number;
  expenseCount: number;
}

export const getProjectFinancialSummary = async (
  projectId: number,
  userId: number
): Promise<ProjectFinancialSummary> => {
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

    // Get invoice totals
    const invoicesResult = await client.query(
      `SELECT 
        COUNT(*) as invoice_count,
        COALESCE(SUM("totalAmount"), 0) as total_invoices
      FROM invoices 
      WHERE "projectId" = $1 AND "userId" = $2`,
      [projectId, userId]
    );

    // Get expense totals
    const expensesResult = await client.query(
      `SELECT 
        COUNT(*) as expense_count,
        COALESCE(SUM("totalAmount"), 0) as total_expenses
      FROM expenses 
      WHERE "projectId" = $1 AND "userId" = $2`,
      [projectId, userId]
    );

    const invoiceCount = parseInt(invoicesResult.rows[0].invoice_count || '0', 10);
    const totalInvoices = parseFloat(invoicesResult.rows[0].total_invoices || '0');
    const expenseCount = parseInt(expensesResult.rows[0].expense_count || '0', 10);
    const totalExpenses = parseFloat(expensesResult.rows[0].total_expenses || '0');
    const profit = totalInvoices - totalExpenses;

    return {
      projectId,
      totalInvoices,
      totalExpenses,
      profit,
      invoiceCount,
      expenseCount,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error fetching project financial summary:', error);
    throw new AppError('Failed to fetch project financial summary', 500);
  } finally {
    client.release();
  }
};

/**
 * Map database project to response DTO
 */
const mapProjectToResponse = (dbProject: any): ProjectResponse => {
  return {
    id: dbProject.id,
    name: dbProject.name,
    description: dbProject.description,
    startDate: dbProject.startDate ? new Date(dbProject.startDate) : undefined,
    endDate: dbProject.endDate ? new Date(dbProject.endDate) : undefined,
    status: dbProject.status || 'active',
    budget: dbProject.budget ? parseFloat(dbProject.budget) : undefined,
    userId: dbProject.userId,
    createdAt: new Date(dbProject.createdAt),
    updatedAt: new Date(dbProject.updatedAt),
    clientCount: dbProject.clientCount ? parseInt(dbProject.clientCount, 10) : 0,
  };
};
