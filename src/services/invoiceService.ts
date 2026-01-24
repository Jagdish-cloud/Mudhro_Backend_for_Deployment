import pool from '../config/database';
import BlobStorageService, { FileType } from './blobStorageService';
import {
  InvoiceCreateData,
  InvoiceUpdateData,
  InvoiceResponse,
} from '../types/invoice';
import { AppError } from '../middleware/errorHandler';
import { sendMail } from './mailer';
import { buildInvoiceEmail, buildInvoiceUpdateEmail, buildReminderEmail } from '../utils/emailTemplates';
import { createPaymentReminders, deletePaymentRemindersByInvoiceId, createManualReminder } from './paymentReminderService';
import { deletePaymentsByInvoiceId } from './paymentService';

/**
 * Create a new invoice with items
 */
export const createInvoice = async (
  invoiceData: InvoiceCreateData
): Promise<InvoiceResponse> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verify user exists
    const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [
      invoiceData.userId,
    ]);

    if (userCheck.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    // Verify client exists and belongs to user
    const clientCheck = await client.query(
      'SELECT id, "fullName", organization, email FROM master_clients WHERE id = $1 AND "userId" = $2',
      [invoiceData.clientId, invoiceData.userId]
    );

    if (clientCheck.rows.length === 0) {
      throw new AppError('Client not found', 404);
    }

    // Frontend calculates all amounts, we just store them
    // GST is stored as percentage (e.g., 18 for 18%)
    // subTotalAmount and totalAmount are calculated by frontend
    let subTotal = invoiceData.subTotalAmount || 0;
    let gstPercentage = invoiceData.gst || 0; // GST percentage (0-100)
    let totalAmount = invoiceData.totalAmount || 0;

    // If items are provided but amounts not calculated, calculate from items
    if (invoiceData.items && invoiceData.items.length > 0 && !invoiceData.subTotalAmount) {
      // Calculate subTotal from items
      subTotal = invoiceData.items.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0
      );
      // If totalAmount not provided, calculate it with GST percentage
      if (!invoiceData.totalAmount && gstPercentage > 0) {
        const gstAmount = (subTotal * gstPercentage) / 100;
        totalAmount = subTotal + gstAmount;
      } else if (!invoiceData.totalAmount) {
        totalAmount = subTotal;
      }
    }

    // Get user's default currency if not provided
    const userResult = await client.query('SELECT currency FROM users WHERE id = $1', [invoiceData.userId]);
    const defaultCurrency = userResult.rows[0]?.currency || 'INR';
    const currency = invoiceData.currency || defaultCurrency;

    // Determine initial status based on due date
    const dueDateObj = typeof invoiceData.dueDate === 'string' ? new Date(invoiceData.dueDate) : invoiceData.dueDate;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dueDateObj.setHours(0, 0, 0, 0);
    const initialStatus = dueDateObj < today ? 'overdue' : 'pending';

    // Insert invoice
    const invoiceResult = await client.query(
      `INSERT INTO invoices (
        "userId", "clientId", "invoiceNumber", "invoiceDate", "dueDate",
        "subTotalAmount", gst, "totalAmount", currency, "totalInstallments", 
        "currentInstallment", "additionalNotes", "paymentReminderRepetition", status,
        "paymentTerms", "advanceAmount", "balanceDue", "balanceDueDate",
        "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING 
        id, "userId", "clientId", "invoiceNumber", "invoiceDate", "dueDate",
        "subTotalAmount", gst, "totalAmount", currency, "totalInstallments", 
        "currentInstallment", "additionalNotes", "paymentReminderRepetition", status,
        "paymentTerms", "advanceAmount", "balanceDue", "balanceDueDate",
        "createdAt", "updatedAt",
        invoice_file_name AS "invoiceFileName"`,
      [
        invoiceData.userId,
        invoiceData.clientId,
        invoiceData.invoiceNumber || null,
        invoiceData.invoiceDate,
        invoiceData.dueDate,
        subTotal,
        gstPercentage, // Store GST as percentage
        totalAmount,
        currency,
        invoiceData.totalInstallments || 1,
        invoiceData.currentInstallment || 1,
        invoiceData.additionalNotes || 'Thank you for your business',
        invoiceData.paymentReminderRepetition && invoiceData.paymentReminderRepetition.length > 0
          ? JSON.stringify(invoiceData.paymentReminderRepetition)
          : null,
        initialStatus,
        invoiceData.paymentTerms || 'full',
        invoiceData.advanceAmount || null,
        invoiceData.balanceDue || null,
        invoiceData.balanceDueDate || null,
      ]
    );

    const invoice = invoiceResult.rows[0];

    // Insert invoice items if provided
    if (invoiceData.items && invoiceData.items.length > 0) {
      for (const item of invoiceData.items) {
        // Verify item exists and belongs to user
        const itemCheck = await client.query(
          'SELECT id, name FROM items WHERE id = $1 AND "userId" = $2',
          [item.itemsId, invoiceData.userId]
        );

        if (itemCheck.rows.length === 0) {
          throw new AppError(`Item with ID ${item.itemsId} not found`, 404);
        }

        await client.query(
          `INSERT INTO invoice_items ("invoiceId", "itemsId", quantity, "unitPrice", "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [invoice.id, item.itemsId, item.quantity, item.unitPrice]
        );

        // Not collecting PDF items anymore; PDF generation handled externally
      }
    }

    await client.query('COMMIT');

    // Create payment reminders if repetition type is set
    if (invoiceData.paymentReminderRepetition) {
      try {
        await createPaymentReminders(
          invoice.id,
          invoiceData.dueDate,
          invoiceData.paymentReminderRepetition
        );
      } catch (error) {
        console.error('Error creating payment reminders:', error);
        // Don't fail invoice creation if reminder creation fails
      }
    }

    return mapInvoiceToResponse(invoice);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error creating invoice:', error);
    throw new AppError('Failed to create invoice', 500);
  } finally {
    client.release();
  }
};

/**
 * Get all invoices for a user
 */
export const getInvoicesByUserId = async (
  userId: number
): Promise<InvoiceResponse[]> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT 
        id, "userId", "clientId", "invoiceNumber", "invoiceDate", "dueDate",
        "subTotalAmount", gst, "totalAmount", currency, "totalInstallments", 
        "currentInstallment", "additionalNotes", "paymentReminderRepetition", status,
        "paymentTerms", "advanceAmount", "balanceDue", "balanceDueDate",
        "createdAt", "updatedAt",
        invoice_file_name AS "invoiceFileName"
      FROM invoices 
      WHERE "userId" = $1
      ORDER BY "invoiceDate" DESC, "createdAt" DESC`,
      [userId]
    );

    return result.rows.map(mapInvoiceToResponse);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    throw new AppError('Failed to fetch invoices', 500);
  } finally {
    client.release();
  }
};

/**
 * Get invoice by ID
 */
export const getInvoiceById = async (
  invoiceId: number,
  userId: number
): Promise<InvoiceResponse> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT 
        id, "userId", "clientId", "invoiceNumber", "invoiceDate", "dueDate",
        "subTotalAmount", gst, "totalAmount", currency, "totalInstallments", 
        "currentInstallment", "additionalNotes", "paymentReminderRepetition", status,
        "paymentTerms", "advanceAmount", "balanceDue", "balanceDueDate",
        "createdAt", "updatedAt",
        invoice_file_name AS "invoiceFileName"
      FROM invoices 
      WHERE id = $1 AND "userId" = $2`,
      [invoiceId, userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Invoice not found', 404);
    }

    return mapInvoiceToResponse(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to retrieve invoice', 500);
  } finally {
    client.release();
  }
};

/**
 * Update invoice
 */
export const updateInvoice = async (
  invoiceId: number,
  userId: number,
  updateData: InvoiceUpdateData
): Promise<InvoiceResponse> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if invoice exists and belongs to user, and get current status
    const existingInvoice = await client.query(
      'SELECT id, status FROM invoices WHERE id = $1 AND "userId" = $2',
      [invoiceId, userId]
    );

    if (existingInvoice.rows.length === 0) {
      throw new AppError('Invoice not found', 404);
    }

    const currentStatus = existingInvoice.rows[0].status;

    // If status is being changed from 'paid' to 'pending' or 'overdue', delete all payments
    if (updateData.status !== undefined && 
        currentStatus === 'paid' && 
        (updateData.status === 'pending' || updateData.status === 'overdue')) {
      await deletePaymentsByInvoiceId(invoiceId, userId, client);
    }

    // If clientId is being updated, verify it exists and belongs to user
    if (updateData.clientId) {
      const clientCheck = await client.query(
        'SELECT id FROM master_clients WHERE id = $1 AND "userId" = $2',
        [updateData.clientId, userId]
      );

      if (clientCheck.rows.length === 0) {
        throw new AppError('Client not found', 404);
      }
    }

    // Build dynamic update query
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updateData.clientId !== undefined) {
      updateFields.push(`"clientId" = $${paramIndex}`);
      values.push(updateData.clientId);
      paramIndex++;
    }
    if (updateData.invoiceNumber !== undefined) {
      updateFields.push(`"invoiceNumber" = $${paramIndex}`);
      values.push(updateData.invoiceNumber);
      paramIndex++;
    }
    if (updateData.invoiceDate !== undefined) {
      updateFields.push(`"invoiceDate" = $${paramIndex}`);
      values.push(updateData.invoiceDate);
      paramIndex++;
    }
    if (updateData.dueDate !== undefined) {
      updateFields.push(`"dueDate" = $${paramIndex}`);
      values.push(updateData.dueDate);
      paramIndex++;
    }
    if (updateData.subTotalAmount !== undefined) {
      updateFields.push(`"subTotalAmount" = $${paramIndex}`);
      values.push(updateData.subTotalAmount);
      paramIndex++;
    }
    if (updateData.gst !== undefined) {
      updateFields.push(`gst = $${paramIndex}`);
      values.push(updateData.gst);
      paramIndex++;
    }
    if (updateData.totalAmount !== undefined) {
      updateFields.push(`"totalAmount" = $${paramIndex}`);
      values.push(updateData.totalAmount);
      paramIndex++;
    }
    if (updateData.currency !== undefined) {
      updateFields.push(`currency = $${paramIndex}`);
      values.push(updateData.currency);
      paramIndex++;
    }
    if (updateData.totalInstallments !== undefined) {
      updateFields.push(`"totalInstallments" = $${paramIndex}`);
      values.push(updateData.totalInstallments);
      paramIndex++;
    }
    if (updateData.currentInstallment !== undefined) {
      updateFields.push(`"currentInstallment" = $${paramIndex}`);
      values.push(updateData.currentInstallment);
      paramIndex++;
    }
    if (updateData.additionalNotes !== undefined) {
      updateFields.push(`"additionalNotes" = $${paramIndex}`);
      values.push(updateData.additionalNotes);
      paramIndex++;
    }
    if (updateData.paymentReminderRepetition !== undefined) {
      updateFields.push(`"paymentReminderRepetition" = $${paramIndex}`);
      values.push(
        updateData.paymentReminderRepetition && updateData.paymentReminderRepetition.length > 0
          ? JSON.stringify(updateData.paymentReminderRepetition)
          : null
      );
      paramIndex++;
    }
    if (updateData.status !== undefined) {
      // Validate status value
      if (!['paid', 'pending', 'overdue'].includes(updateData.status)) {
        throw new AppError('Invalid status. Must be one of: paid, pending, overdue', 400);
      }
      updateFields.push(`status = $${paramIndex}`);
      values.push(updateData.status);
      paramIndex++;
    }

    if (updateData.paymentTerms !== undefined) {
      updateFields.push(`"paymentTerms" = $${paramIndex}`);
      values.push(updateData.paymentTerms);
      paramIndex++;
    }

    if (updateData.advanceAmount !== undefined) {
      updateFields.push(`"advanceAmount" = $${paramIndex}`);
      values.push(updateData.advanceAmount);
      paramIndex++;
    }

    if (updateData.balanceDue !== undefined) {
      updateFields.push(`"balanceDue" = $${paramIndex}`);
      values.push(updateData.balanceDue);
      paramIndex++;
    }

    if (updateData.balanceDueDate !== undefined) {
      updateFields.push(`"balanceDueDate" = $${paramIndex}`);
      values.push(updateData.balanceDueDate);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    values.push(invoiceId, userId);

    const result = await client.query(
      `UPDATE invoices 
      SET ${updateFields.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex} AND "userId" = $${paramIndex + 1}
      RETURNING 
        id, "userId", "clientId", "invoiceNumber", "invoiceDate", "dueDate",
        "subTotalAmount", gst, "totalAmount", currency, "totalInstallments", 
        "currentInstallment", "additionalNotes", "paymentReminderRepetition", status,
        "paymentTerms", "advanceAmount", "balanceDue", "balanceDueDate",
        "createdAt", "updatedAt",
        invoice_file_name AS "invoiceFileName"`,
      values
    );

    const updatedInvoice = result.rows[0];

    // Auto-update status based on dueDate if dueDate changed and status is not explicitly set to "paid"
    if (updateData.dueDate !== undefined && updateData.status === undefined) {
      const dueDateObj = typeof updateData.dueDate === 'string' ? new Date(updateData.dueDate) : updateData.dueDate;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dueDateObj.setHours(0, 0, 0, 0);
      
      // Only auto-update if current status is not "paid"
      if (updatedInvoice.status !== 'paid') {
        const newStatus = dueDateObj < today ? 'overdue' : 'pending';
        await client.query(
          'UPDATE invoices SET status = $1 WHERE id = $2',
          [newStatus, invoiceId]
        );
        updatedInvoice.status = newStatus;
      }
    }

    // Update payment reminders if repetition type or due date changed
    if (updateData.paymentReminderRepetition !== undefined || updateData.dueDate !== undefined) {
      try {
        // Delete existing reminders
        await deletePaymentRemindersByInvoiceId(invoiceId);
        
        // Create new reminders if repetition type is set
        if (updatedInvoice.paymentReminderRepetition) {
          const dueDate = updateData.dueDate || updatedInvoice.dueDate;
          await createPaymentReminders(
            invoiceId,
            dueDate,
            updatedInvoice.paymentReminderRepetition
          );
        }
      } catch (error) {
        console.error('Error updating payment reminders:', error);
        // Don't fail invoice update if reminder update fails
      }
    }

    await client.query('COMMIT');

    return mapInvoiceToResponse(updatedInvoice);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error updating invoice:', error);
    throw new AppError('Failed to update invoice', 500);
  } finally {
    client.release();
  }
};

/**
 * Delete invoice
 */
export const deleteInvoice = async (invoiceId: number, userId: number): Promise<void> => {
  const client = await pool.connect();

  try {
    // Get invoice file name before deleting
    const invoiceResult = await client.query(
      `SELECT invoice_file_name, "invoiceNumber" FROM invoices WHERE id = $1 AND "userId" = $2`,
      [invoiceId, userId]
    );

    if (invoiceResult.rows.length === 0) {
      throw new AppError('Invoice not found', 404);
    }

    const invoice = invoiceResult.rows[0];

    // Delete invoice from database (invoice items will be deleted automatically due to CASCADE)
    await client.query(
      'DELETE FROM invoices WHERE id = $1 AND "userId" = $2',
      [invoiceId, userId]
    );

    // Delete invoice PDF file from Azure Blob Storage if it exists
    if (invoice.invoice_file_name) {
      try {
        const blobPath = `Invoices/${userId}/${invoice.invoice_file_name}`;
        await BlobStorageService.deleteFile(blobPath);
      } catch (fileError: any) {
        // Log error but don't fail the deletion if file doesn't exist
        console.warn('Error deleting invoice file from Azure Blob:', fileError);
      }
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error deleting invoice:', error);
    throw new AppError('Failed to delete invoice', 500);
  } finally {
    client.release();
  }
};

/**
 * Update invoice PDF file reference
 */
export const updateInvoicePdfFilename = async (
  invoiceId: number,
  userId: number,
  fileName: string
): Promise<void> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `UPDATE invoices 
       SET invoice_file_name = $1, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $2 AND "userId" = $3
       RETURNING id`,
      [fileName, invoiceId, userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Invoice not found', 404);
    }
  } finally {
    client.release();
  }
};

/**
 * Send invoice email (initial or reminder)
 * @param skipOverdueCheck - If true, skip the overdue check for reminders (used for automatic scheduled reminders)
 * @param skipReminderRecord - If true, skip creating a manual reminder record (used for automatic scheduled reminders)
 */
export const sendInvoiceEmail = async (
  invoiceId: number,
  userId: number,
  type: 'invoice' | 'reminder' | 'update',
  skipOverdueCheck: boolean = false,
  skipReminderRecord: boolean = false
): Promise<void> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT 
         i.id,
         i."invoiceNumber",
         i."totalAmount",
         i.currency,
         i."invoiceDate",
         i."dueDate",
         i."clientId",
         i.invoice_file_name,
         i."createdAt",
         u."fullName"    AS user_full_name,
         u.email         AS user_email,
         u."mobileNumber" AS user_phone,
         mc."fullName"   AS client_full_name,
         mc.email        AS client_email
       FROM invoices i
       INNER JOIN users u ON i."userId" = u.id
       INNER JOIN master_clients mc ON i."clientId" = mc.id
       WHERE i.id = $1 AND i."userId" = $2`,
      [invoiceId, userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Invoice not found', 404);
    }

    const row = result.rows[0];

    if (!row.client_email) {
      throw new AppError('Client email is missing. Please add an email address for this client before sending.', 400);
    }

    const fileName =
      row.invoice_file_name && row.invoice_file_name.trim() !== ''
        ? row.invoice_file_name
        : row.invoiceNumber.endsWith('.pdf')
          ? row.invoiceNumber
          : `${row.invoiceNumber}.pdf`;
    
    // Get file from Azure Blob Storage for email attachment
    const blobPath = `Invoices/${userId}/${fileName}`;
    let pdfBuffer: Buffer;
    try {
      const fileData = await BlobStorageService.downloadFile(blobPath);
      pdfBuffer = fileData.buffer;
    } catch (error) {
      throw new AppError('Invoice PDF not found in Azure Blob Storage. Please regenerate the invoice PDF and try again.', 404);
    }

    if (type === 'reminder' && !skipOverdueCheck) {
      // Only check for overdue if this is a manual reminder (not automatic scheduled)
      const dueDate = new Date(row.dueDate);
      const today = new Date();
      dueDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);

      if (dueDate >= today) {
        throw new AppError('Reminder emails can only be sent for overdue invoices.', 400);
      }
    }

    const amount = Number(row.totalAmount) || 0;
    const currency = row.currency || 'INR';
    let template;

    if (type === 'invoice') {
      template = buildInvoiceEmail({
        clientFullName: row.client_full_name,
        amount,
        currency,
        userFullName: row.user_full_name,
        userPhone: row.user_phone,
        userEmail: row.user_email,
      });
    } else if (type === 'reminder') {
      const dateSent = row.invoiceDate ? new Date(row.invoiceDate) : new Date(row.createdAt);
      template = buildReminderEmail({
        clientFullName: row.client_full_name,
        amount,
        currency,
        userFullName: row.user_full_name,
        userPhone: row.user_phone,
        userEmail: row.user_email,
        invoiceNumber: row.invoiceNumber,
        dateSent,
      });
    } else {
      template = buildInvoiceUpdateEmail({
        clientFullName: row.client_full_name,
        amount,
        currency,
        userFullName: row.user_full_name,
        userPhone: row.user_phone,
        userEmail: row.user_email,
        invoiceNumber: row.invoiceNumber,
      });
    }

    console.log(`[sendInvoiceEmail] Preparing to send ${type} email for invoice #${row.invoiceNumber}`);
    console.log(`[sendInvoiceEmail] Client email: ${row.client_email}`);
    console.log(`[sendInvoiceEmail] PDF file: ${fileName} (${pdfBuffer.length} bytes)`);

    try {
      await sendMail({
        to: row.client_email,
        subject: template.subject,
        html: template.html,
        text: template.text,
        attachments: [
          {
            filename: fileName,
            content: pdfBuffer,
          } as any, // nodemailer supports content for attachments
        ],
      });

      console.log(`[sendInvoiceEmail] ✅ Email sent successfully to ${row.client_email}`);

      // Create a manual reminder record when reminder is sent manually (not automated)
      if (type === 'reminder' && !skipReminderRecord) {
        try {
          const reminderRecord = await createManualReminder(invoiceId, userId, row.clientId);
          console.log(`[sendInvoiceEmail] ✅ Manual reminder record created (ID: ${reminderRecord.id})`);
        } catch (error) {
          console.error('[sendInvoiceEmail] ❌ Error creating manual reminder record:', error);
          // Don't fail the email send if reminder record creation fails
        }
      }
    } catch (emailError: any) {
      console.error(`[sendInvoiceEmail] ❌ Failed to send email:`, emailError);
      console.error(`[sendInvoiceEmail] Error details:`, {
        message: emailError.message,
        code: emailError.code,
        response: emailError.response,
      });
      throw new AppError(`Failed to send email: ${emailError.message}`, 500);
    }
  } finally {
    client.release();
  }
};

/**
 * Map database invoice to response DTO
 */
const mapInvoiceToResponse = (dbInvoice: any): InvoiceResponse => {
  return {
    id: dbInvoice.id,
    userId: dbInvoice.userId,
    clientId: dbInvoice.clientId,
    invoiceNumber: dbInvoice.invoiceNumber,
    invoiceDate: new Date(dbInvoice.invoiceDate),
    dueDate: new Date(dbInvoice.dueDate),
    subTotalAmount: parseFloat(dbInvoice.subTotalAmount),
    gst: parseFloat(dbInvoice.gst),
    totalAmount: parseFloat(dbInvoice.totalAmount),
    currency: dbInvoice.currency || 'INR',
    totalInstallments: dbInvoice.totalInstallments,
    currentInstallment: dbInvoice.currentInstallment,
    additionalNotes: dbInvoice.additionalNotes,
    paymentReminderRepetition: dbInvoice.paymentReminderRepetition
      ? (typeof dbInvoice.paymentReminderRepetition === 'string'
          ? (() => {
              try {
                const parsed = JSON.parse(dbInvoice.paymentReminderRepetition);
                return Array.isArray(parsed) ? parsed : [parsed];
              } catch {
                // Fallback for old format (single string value)
                return [dbInvoice.paymentReminderRepetition];
              }
            })()
          : Array.isArray(dbInvoice.paymentReminderRepetition)
          ? dbInvoice.paymentReminderRepetition
          : [dbInvoice.paymentReminderRepetition])
      : null,
    status: dbInvoice.status || 'pending',
    paymentTerms: dbInvoice.paymentTerms || 'full',
    advanceAmount: dbInvoice.advanceAmount ? parseFloat(dbInvoice.advanceAmount) : null,
    balanceDue: dbInvoice.balanceDue ? parseFloat(dbInvoice.balanceDue) : null,
    balanceDueDate: dbInvoice.balanceDueDate ? new Date(dbInvoice.balanceDueDate) : null,
    invoiceFileName: dbInvoice.invoiceFileName,
    createdAt: new Date(dbInvoice.createdAt),
    updatedAt: new Date(dbInvoice.updatedAt),
  };
};

