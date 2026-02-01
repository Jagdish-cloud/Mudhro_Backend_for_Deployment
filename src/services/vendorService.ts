import path from 'path';
import { promises as fs } from 'fs';
import pool from '../config/database';
import {
  VendorCreateData,
  VendorResponse,
  VendorUpdateData,
} from '../types/vendor';
import { AppError } from '../middleware/errorHandler';

/**
 * Create a new vendor
 */
export const createVendor = async (
  vendorData: VendorCreateData
): Promise<VendorResponse> => {
  const client = await pool.connect();

  try {
    const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [
      vendorData.userId,
    ]);

    if (userCheck.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    // Check for duplicate email only if email is provided
    if (vendorData.email) {
      const existingVendor = await client.query(
        'SELECT id FROM vendors WHERE email = $1 AND "userId" = $2',
        [vendorData.email, vendorData.userId]
      );

      if (existingVendor.rows.length > 0) {
        throw new AppError(
          'Vendor with this email already exists for this user',
          409
        );
      }
    }

    const result = await client.query(
      `INSERT INTO vendors (
        organization, "fullName", email, "mobileNumber", gstin, pan, "isActive", "userId",
        "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING 
        id, organization, "fullName", email, "mobileNumber", gstin, pan, "isActive",
        "userId", "createdAt", "updatedAt"`,
      [
        vendorData.organization || null,
        vendorData.fullName,
        vendorData.email || null,
        vendorData.mobileNumber || null,
        vendorData.gstin || null,
        vendorData.pan || null,
        vendorData.isActive !== undefined ? vendorData.isActive : true,
        vendorData.userId,
      ]
    );

    return mapVendorToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error creating vendor:', error);
    throw new AppError('Failed to create vendor', 500);
  } finally {
    client.release();
  }
};

/**
 * Get all vendors for a user
 */
export const getVendorsByUserId = async (
  userId: number
): Promise<VendorResponse[]> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT 
        id, organization, "fullName", email, "mobileNumber", gstin, pan, "isActive",
        "userId", "createdAt", "updatedAt"
      FROM vendors 
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC`,
      [userId]
    );

    return result.rows.map(mapVendorToResponse);
  } catch (error) {
    console.error('Error fetching vendors:', error);
    throw new AppError('Failed to fetch vendors', 500);
  } finally {
    client.release();
  }
};

/**
 * Get vendor by ID
 */
export const getVendorById = async (
  vendorId: number,
  userId: number
): Promise<VendorResponse> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT 
        id, organization, "fullName", email, "mobileNumber", gstin, pan, "isActive",
        "userId", "createdAt", "updatedAt"
      FROM vendors 
      WHERE id = $1 AND "userId" = $2`,
      [vendorId, userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Vendor not found', 404);
    }

    return mapVendorToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to retrieve vendor', 500);
  } finally {
    client.release();
  }
};

/**
 * Update vendor
 */
export const updateVendor = async (
  vendorId: number,
  userId: number,
  updateData: VendorUpdateData
): Promise<VendorResponse> => {
  const client = await pool.connect();

  try {
    const existingVendor = await client.query(
      'SELECT id FROM vendors WHERE id = $1 AND "userId" = $2',
      [vendorId, userId]
    );

    if (existingVendor.rows.length === 0) {
      throw new AppError('Vendor not found', 404);
    }

    if (updateData.email) {
      const emailCheck = await client.query(
        'SELECT id FROM vendors WHERE email = $1 AND "userId" = $2 AND id != $3',
        [updateData.email, userId, vendorId]
      );

      if (emailCheck.rows.length > 0) {
        throw new AppError(
          'Vendor with this email already exists for this user',
          409
        );
      }
    }

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
      values.push(updateData.email || null);
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

    if (updateFields.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    values.push(vendorId, userId);

    const result = await client.query(
      `UPDATE vendors 
      SET ${updateFields.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex} AND "userId" = $${paramIndex + 1}
      RETURNING 
        id, organization, "fullName", email, "mobileNumber", gstin, pan, "isActive",
        "userId", "createdAt", "updatedAt"`,
      values
    );

    return mapVendorToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error updating vendor:', error);
    throw new AppError('Failed to update vendor', 500);
  } finally {
    client.release();
  }
};

/**
 * Delete vendor
 */
export const deleteVendor = async (
  vendorId: number,
  userId: number
): Promise<void> => {
  const client = await pool.connect();

  try {
    // Verify vendor exists and belongs to user
    const vendorCheck = await client.query(
      'SELECT id FROM vendors WHERE id = $1 AND "userId" = $2',
      [vendorId, userId]
    );

    if (vendorCheck.rows.length === 0) {
      throw new AppError('Vendor not found', 404);
    }

    // Get all vendor documents before deleting
    const documentsResult = await client.query(
      'SELECT "filePath" FROM vendor_documents WHERE "vendorId" = $1',
      [vendorId]
    );

    // Delete vendor from database
    await client.query(
      'DELETE FROM vendors WHERE id = $1 AND "userId" = $2',
      [vendorId, userId]
    );

    // Delete all vendor document files
    for (const doc of documentsResult.rows) {
      try {
        const fullPath = path.join(process.cwd(), doc.filePath);
        await fs.unlink(fullPath);
      } catch (fileError: any) {
        if (fileError.code !== 'ENOENT') {
          console.error('Error deleting vendor document file:', fileError);
        }
      }
    }

    // Try to remove the vendor documents directory if empty
    try {
      const documentsRoot = path.join(process.cwd(), 'VendorDocuments', String(userId), String(vendorId));
      await fs.rmdir(documentsRoot, { recursive: true });
    } catch (dirError: any) {
      // Ignore errors when removing directory
      if (dirError.code !== 'ENOENT') {
        console.warn('Error removing vendor documents directory:', dirError);
      }
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error deleting vendor:', error);
    throw new AppError('Failed to delete vendor', 500);
  } finally {
    client.release();
  }
};

const mapVendorToResponse = (dbVendor: any): VendorResponse => ({
  id: dbVendor.id,
  organization: dbVendor.organization ?? null,
  fullName: dbVendor.fullName,
  email: dbVendor.email,
  mobileNumber: dbVendor.mobileNumber ?? null,
  gstin: dbVendor.gstin ?? null,
  pan: dbVendor.pan ?? null,
  isActive: dbVendor.isActive !== undefined ? dbVendor.isActive : true,
  userId: dbVendor.userId,
  createdAt: new Date(dbVendor.createdAt),
  updatedAt: new Date(dbVendor.updatedAt),
});


