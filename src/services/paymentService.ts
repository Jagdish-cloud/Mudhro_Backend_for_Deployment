import pool from '../config/database';
import { Payment, PaymentCreateData, PaymentUpdateData, PaymentResponse } from '../types/payment';
import { AppError } from '../middleware/errorHandler';

/**
 * Calculate final amount after deductions
 */
const calculateFinalAmount = (
  amountReceived: number,
  paymentGatewayFee: number = 0,
  tdsDeducted: number = 0,
  otherDeduction: number = 0
): number => {
  return amountReceived - paymentGatewayFee - tdsDeducted - otherDeduction;
};

/**
 * Map database payment to response DTO
 */
const mapPaymentToResponse = (dbPayment: any): PaymentResponse => {
  return {
    id: dbPayment.id,
    invoiceId: dbPayment.invoiceId,
    userId: dbPayment.userId,
    clientId: dbPayment.clientId,
    invoiceAmount: parseFloat(dbPayment.invoiceAmount),
    amountReceived: parseFloat(dbPayment.amountReceived),
    paymentGatewayFee: parseFloat(dbPayment.paymentGatewayFee || 0),
    tdsDeducted: parseFloat(dbPayment.tdsDeducted || 0),
    otherDeduction: parseFloat(dbPayment.otherDeduction || 0),
    finalAmount: parseFloat(dbPayment.finalAmount),
    paymentDate: new Date(dbPayment.paymentDate),
    notes: dbPayment.notes || undefined,
    createdAt: new Date(dbPayment.createdAt),
    updatedAt: new Date(dbPayment.updatedAt),
  };
};

/**
 * Create a payment record and update invoice status to 'paid'
 */
export const createPayment = async (
  userId: number,
  paymentData: PaymentCreateData
): Promise<PaymentResponse> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verify invoice exists and belongs to user
    const invoiceResult = await client.query(
      `SELECT id, "userId", "clientId", "totalAmount" 
       FROM invoices 
       WHERE id = $1 AND "userId" = $2`,
      [paymentData.invoiceId, userId]
    );

    if (invoiceResult.rows.length === 0) {
      throw new AppError('Invoice not found', 404);
    }

    const invoice = invoiceResult.rows[0];
    const invoiceAmount = parseFloat(invoice.totalAmount);
    const amountReceived = paymentData.amountReceived;
    const paymentGatewayFee = paymentData.paymentGatewayFee || 0;
    const tdsDeducted = paymentData.tdsDeducted || 0;
    const otherDeduction = paymentData.otherDeduction || 0;

    // Validate amount received
    if (amountReceived <= 0) {
      throw new AppError('Amount received must be greater than 0', 400);
    }

    if (amountReceived > invoiceAmount) {
      throw new AppError('Amount received cannot exceed invoice amount', 400);
    }

    // Validate deductions are non-negative
    if (paymentGatewayFee < 0 || tdsDeducted < 0 || otherDeduction < 0) {
      throw new AppError('Deductions cannot be negative', 400);
    }

    // Calculate final amount
    const finalAmount = calculateFinalAmount(
      amountReceived,
      paymentGatewayFee,
      tdsDeducted,
      otherDeduction
    );

    // Insert payment record
    const paymentDate = paymentData.paymentDate 
      ? (typeof paymentData.paymentDate === 'string' 
          ? new Date(paymentData.paymentDate) 
          : paymentData.paymentDate)
      : new Date();

    const paymentResult = await client.query(
      `INSERT INTO payments (
        "invoiceId", "userId", "clientId", "invoiceAmount", "amountReceived",
        "paymentGatewayFee", "tdsDeducted", "otherDeduction", "finalAmount",
        "paymentDate", notes, "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        paymentData.invoiceId,
        userId,
        invoice.clientId,
        invoiceAmount,
        amountReceived,
        paymentGatewayFee,
        tdsDeducted,
        otherDeduction,
        finalAmount,
        paymentDate,
        paymentData.notes || null,
      ]
    );

    // Update invoice status to 'paid'
    await client.query(
      'UPDATE invoices SET status = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2',
      ['paid', paymentData.invoiceId]
    );

    await client.query('COMMIT');

    return mapPaymentToResponse(paymentResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error creating payment:', error);
    throw new AppError('Failed to create payment', 500);
  } finally {
    client.release();
  }
};

/**
 * Get all payments for an invoice
 */
export const getPaymentsByInvoiceId = async (
  invoiceId: number,
  userId: number
): Promise<PaymentResponse[]> => {
  const client = await pool.connect();

  try {
    // Verify invoice belongs to user
    const invoiceCheck = await client.query(
      'SELECT id FROM invoices WHERE id = $1 AND "userId" = $2',
      [invoiceId, userId]
    );

    if (invoiceCheck.rows.length === 0) {
      throw new AppError('Invoice not found', 404);
    }

    const result = await client.query(
      `SELECT * FROM payments 
       WHERE "invoiceId" = $1 
       ORDER BY "paymentDate" DESC, "createdAt" DESC`,
      [invoiceId]
    );

    return result.rows.map(mapPaymentToResponse);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error fetching payments:', error);
    throw new AppError('Failed to fetch payments', 500);
  } finally {
    client.release();
  }
};

/**
 * Get all payments for a user
 */
export const getPaymentsByUserId = async (
  userId: number
): Promise<PaymentResponse[]> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT * FROM payments 
       WHERE "userId" = $1 
       ORDER BY "paymentDate" DESC, "createdAt" DESC`,
      [userId]
    );

    return result.rows.map(mapPaymentToResponse);
  } catch (error) {
    console.error('Error fetching payments:', error);
    throw new AppError('Failed to fetch payments', 500);
  } finally {
    client.release();
  }
};

/**
 * Get a payment by ID
 */
export const getPaymentById = async (
  paymentId: number,
  userId: number
): Promise<PaymentResponse> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT * FROM payments 
       WHERE id = $1 AND "userId" = $2`,
      [paymentId, userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Payment not found', 404);
    }

    return mapPaymentToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error fetching payment:', error);
    throw new AppError('Failed to fetch payment', 500);
  } finally {
    client.release();
  }
};

/**
 * Update an existing payment record
 */
export const updatePayment = async (
  paymentId: number,
  userId: number,
  updateData: PaymentUpdateData
): Promise<PaymentResponse> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verify payment exists and belongs to user
    const paymentCheck = await client.query(
      `SELECT p.*, i."totalAmount" as "invoiceAmount"
       FROM payments p
       INNER JOIN invoices i ON p."invoiceId" = i.id
       WHERE p.id = $1 AND p."userId" = $2`,
      [paymentId, userId]
    );

    if (paymentCheck.rows.length === 0) {
      throw new AppError('Payment not found', 404);
    }

    const existingPayment = paymentCheck.rows[0];
    const invoiceAmount = parseFloat(existingPayment.invoiceAmount);

    // Build dynamic update query
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    let amountReceived = existingPayment.amountReceived;
    let paymentGatewayFee = parseFloat(existingPayment.paymentGatewayFee || 0);
    let tdsDeducted = parseFloat(existingPayment.tdsDeducted || 0);
    let otherDeduction = parseFloat(existingPayment.otherDeduction || 0);

    if (updateData.amountReceived !== undefined) {
      amountReceived = updateData.amountReceived;
      updateFields.push(`"amountReceived" = $${paramIndex}`);
      values.push(amountReceived);
      paramIndex++;
    }

    if (updateData.paymentGatewayFee !== undefined) {
      paymentGatewayFee = updateData.paymentGatewayFee;
      updateFields.push(`"paymentGatewayFee" = $${paramIndex}`);
      values.push(paymentGatewayFee);
      paramIndex++;
    }

    if (updateData.tdsDeducted !== undefined) {
      tdsDeducted = updateData.tdsDeducted;
      updateFields.push(`"tdsDeducted" = $${paramIndex}`);
      values.push(tdsDeducted);
      paramIndex++;
    }

    if (updateData.otherDeduction !== undefined) {
      otherDeduction = updateData.otherDeduction;
      updateFields.push(`"otherDeduction" = $${paramIndex}`);
      values.push(otherDeduction);
      paramIndex++;
    }

    if (updateData.notes !== undefined) {
      updateFields.push(`notes = $${paramIndex}`);
      values.push(updateData.notes || null);
      paramIndex++;
    }

    if (updateData.paymentDate !== undefined) {
      const paymentDate = typeof updateData.paymentDate === 'string' 
        ? new Date(updateData.paymentDate) 
        : updateData.paymentDate;
      updateFields.push(`"paymentDate" = $${paramIndex}`);
      values.push(paymentDate);
      paramIndex++;
    }

    // Validate deductions are non-negative
    if (paymentGatewayFee < 0 || tdsDeducted < 0 || otherDeduction < 0) {
      throw new AppError('Deductions cannot be negative', 400);
    }

    // Validate amount received
    if (amountReceived <= 0) {
      throw new AppError('Amount received must be greater than 0', 400);
    }

    if (amountReceived > invoiceAmount) {
      throw new AppError('Amount received cannot exceed invoice amount', 400);
    }

    // Recalculate final amount
    const finalAmount = calculateFinalAmount(
      amountReceived,
      paymentGatewayFee,
      tdsDeducted,
      otherDeduction
    );

    updateFields.push(`"finalAmount" = $${paramIndex}`);
    values.push(finalAmount);
    paramIndex++;

    if (updateFields.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    values.push(paymentId, userId);

    const result = await client.query(
      `UPDATE payments 
       SET ${updateFields.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $${paramIndex} AND "userId" = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    await client.query('COMMIT');

    return mapPaymentToResponse(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error updating payment:', error);
    throw new AppError('Failed to update payment', 500);
  } finally {
    client.release();
  }
};

/**
 * Delete all payment records for a specific invoice
 * @param invoiceId - The invoice ID
 * @param userId - The user ID (for verification)
 * @param client - Optional database client for transaction support. If not provided, creates a new connection.
 */
export const deletePaymentsByInvoiceId = async (
  invoiceId: number,
  userId: number,
  client?: any
): Promise<void> => {
  const shouldReleaseClient = !client;
  
  // If no client provided, create a new connection
  if (!client) {
    client = await pool.connect();
  }

  try {
    // Verify invoice exists and belongs to user
    const invoiceCheck = await client.query(
      'SELECT id FROM invoices WHERE id = $1 AND "userId" = $2',
      [invoiceId, userId]
    );

    if (invoiceCheck.rows.length === 0) {
      throw new AppError('Invoice not found', 404);
    }

    // Delete all payments for this invoice
    await client.query(
      'DELETE FROM payments WHERE "invoiceId" = $1',
      [invoiceId]
    );
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error deleting payments:', error);
    throw new AppError('Failed to delete payments', 500);
  } finally {
    // Only release client if we created it
    if (shouldReleaseClient) {
      client.release();
    }
  }
};

