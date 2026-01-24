import pool from '../config/database';
import { AppError } from '../middleware/errorHandler';

export interface PaymentReminder {
  id: number;
  invoiceId: number;
  userId: number;
  clientId: number;
  reminderType: string; // '3', '7', 'Only on Due date', 'Manual'
  scheduledDate: Date;
  sentAt: Date | null;
  isSent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentReminderCreateData {
  invoiceId: number;
  reminderType: string;
  scheduledDate: Date | string;
}

/**
 * Create payment reminders for an invoice based on repetition type
 */
export const createPaymentReminders = async (
  invoiceId: number,
  dueDate: Date | string,
  repetitionTypes: string[] | null
): Promise<PaymentReminder[]> => {
  if (!repetitionTypes || repetitionTypes.length === 0) {
    return []; // No reminders if repetition types are not set
  }

  const client = await pool.connect();
  const reminders: PaymentReminder[] = [];

  try {
    await client.query('BEGIN');

    // Get userId, clientId, and status from invoice
    const invoiceResult = await client.query(
      'SELECT "userId", "clientId", status FROM invoices WHERE id = $1',
      [invoiceId]
    );

    if (invoiceResult.rows.length === 0) {
      throw new AppError('Invoice not found', 404);
    }

    // Check if invoice is marked as PAID
    const status = invoiceResult.rows[0].status;
    if (status === 'paid') {
      console.log(`[createPaymentReminders] Skipping invoice ${invoiceId}: Invoice is marked as PAID`);
      await client.query('COMMIT');
      return []; // Return empty array - no reminders for PAID invoices
    }

    const userId = invoiceResult.rows[0].userId;
    const clientId = invoiceResult.rows[0].clientId;

    const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
    const scheduledDates: { type: string; date: Date }[] = [];

    // Process each repetition type in the array
    for (const repetitionType of repetitionTypes) {
      if (repetitionType === '3') {
        // 3 days before due date
        const date3DaysBefore = new Date(due);
        date3DaysBefore.setDate(date3DaysBefore.getDate() - 3);
        date3DaysBefore.setHours(0, 0, 0, 0); // Set to midnight for accurate date comparison
        scheduledDates.push({ type: '3', date: date3DaysBefore });
      } else if (repetitionType === '7') {
        // 7 days after due date
        const date7DaysAfter = new Date(due);
        date7DaysAfter.setDate(date7DaysAfter.getDate() + 7);
        date7DaysAfter.setHours(0, 0, 0, 0); // Set to midnight for accurate date comparison
        scheduledDates.push({ type: '7', date: date7DaysAfter });
      } else if (repetitionType === 'Only on Due date') {
        // On due date
        const dueDateOnly = new Date(due);
        dueDateOnly.setHours(0, 0, 0, 0); // Set to midnight for accurate date comparison
        scheduledDates.push({ type: 'Only on Due date', date: dueDateOnly });
      } else if (repetitionType === '10') {
        // 10 days after due date
        const date10DaysAfter = new Date(due);
        date10DaysAfter.setDate(date10DaysAfter.getDate() + 10);
        date10DaysAfter.setHours(0, 0, 0, 0); // Set to midnight for accurate date comparison
        scheduledDates.push({ type: '10', date: date10DaysAfter });
      } else if (repetitionType === '15') {
        // 15 days after due date
        const date15DaysAfter = new Date(due);
        date15DaysAfter.setDate(date15DaysAfter.getDate() + 15);
        date15DaysAfter.setHours(0, 0, 0, 0); // Set to midnight for accurate date comparison
        scheduledDates.push({ type: '15', date: date15DaysAfter });
      }
    }

    // Create reminders for each scheduled date
    for (const { type, date } of scheduledDates) {
      const result = await client.query(
        `INSERT INTO payment_reminders (
          "invoiceId", "userId", "clientId", "reminderType", "scheduledDate", "isSent", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING 
          id, "invoiceId", "userId", "clientId", "reminderType", "scheduledDate", "sentAt", "isSent", 
          "createdAt", "updatedAt"`,
        [invoiceId, userId, clientId, type, date]
      );

      reminders.push({
        id: result.rows[0].id,
        invoiceId: result.rows[0].invoiceId,
        userId: result.rows[0].userId,
        clientId: result.rows[0].clientId,
        reminderType: result.rows[0].reminderType,
        scheduledDate: new Date(result.rows[0].scheduledDate),
        sentAt: result.rows[0].sentAt ? new Date(result.rows[0].sentAt) : null,
        isSent: result.rows[0].isSent,
        createdAt: new Date(result.rows[0].createdAt),
        updatedAt: new Date(result.rows[0].updatedAt),
      });
    }

    await client.query('COMMIT');
    return reminders;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating payment reminders:', error);
    throw new AppError('Failed to create payment reminders', 500);
  } finally {
    client.release();
  }
};

/**
 * Create a manual payment reminder (when user sends reminder manually)
 * Always inserts a new row every time manual reminder is triggered
 */
export const createManualReminder = async (
  invoiceId: number,
  userId: number,
  clientId: number
): Promise<PaymentReminder> => {
  const client = await pool.connect();

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Always insert a new reminder record
    const result = await client.query(
      `INSERT INTO payment_reminders (
        "invoiceId", "userId", "clientId", "reminderType", "scheduledDate", "isSent", "sentAt", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, 'Manual', $4, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING 
        id, "invoiceId", "userId", "clientId", "reminderType", "scheduledDate", "sentAt", "isSent", 
        "createdAt", "updatedAt"`,
      [invoiceId, userId, clientId, today]
    );

    const reminder = {
      id: result.rows[0].id,
      invoiceId: result.rows[0].invoiceId,
      userId: result.rows[0].userId,
      clientId: result.rows[0].clientId,
      reminderType: result.rows[0].reminderType,
      scheduledDate: new Date(result.rows[0].scheduledDate),
      sentAt: result.rows[0].sentAt ? new Date(result.rows[0].sentAt) : null,
      isSent: result.rows[0].isSent,
      createdAt: new Date(result.rows[0].createdAt),
      updatedAt: new Date(result.rows[0].updatedAt),
    };

    console.log(`[createManualReminder] ✅ Created new manual reminder record (ID: ${reminder.id}) for invoice ${invoiceId}, date ${today.toISOString().split('T')[0]}`);
    return reminder;
  } catch (error) {
    console.error('Error creating manual reminder:', error);
    throw new AppError('Failed to create manual reminder', 500);
  } finally {
    client.release();
  }
};

/**
 * Create an automated payment reminder record (when automated email is sent)
 * Always inserts a new row every time automated mail is triggered
 * @param invoiceId - Invoice ID
 * @param userId - User ID
 * @param clientId - Client ID
 * @param reminderType - Reminder type: '3', '7', or 'Only on Due date'
 * @param scheduledDate - The date when the reminder was sent (scheduled date)
 * @returns PaymentReminder (newly created)
 */
export const createAutomatedReminder = async (
  invoiceId: number,
  userId: number,
  clientId: number,
  reminderType: string,
  scheduledDate: Date
): Promise<PaymentReminder> => {
  const client = await pool.connect();

  try {
    // Normalize scheduledDate to date only (remove time component)
    const scheduledDateOnly = new Date(scheduledDate);
    scheduledDateOnly.setHours(0, 0, 0, 0);

    // Always insert a new reminder record
    const result = await client.query(
      `INSERT INTO payment_reminders (
        "invoiceId", "userId", "clientId", "reminderType", "scheduledDate", "isSent", "sentAt", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING 
        id, "invoiceId", "userId", "clientId", "reminderType", "scheduledDate", "sentAt", "isSent", 
        "createdAt", "updatedAt"`,
      [invoiceId, userId, clientId, reminderType, scheduledDateOnly]
    );

    const reminder = {
      id: result.rows[0].id,
      invoiceId: result.rows[0].invoiceId,
      userId: result.rows[0].userId,
      clientId: result.rows[0].clientId,
      reminderType: result.rows[0].reminderType,
      scheduledDate: new Date(result.rows[0].scheduledDate),
      sentAt: result.rows[0].sentAt ? new Date(result.rows[0].sentAt) : null,
      isSent: result.rows[0].isSent,
      createdAt: new Date(result.rows[0].createdAt),
      updatedAt: new Date(result.rows[0].updatedAt),
    };

    console.log(`[createAutomatedReminder] ✅ Created new reminder record (ID: ${reminder.id}) for invoice ${invoiceId}, type ${reminderType}, date ${scheduledDateOnly.toISOString().split('T')[0]}`);
    return reminder;
  } catch (error) {
    console.error('Error creating automated reminder:', error);
    throw new AppError('Failed to create automated reminder', 500);
  } finally {
    client.release();
  }
};

/**
 * Get all payment reminders for an invoice
 */
export const getPaymentRemindersByInvoiceId = async (
  invoiceId: number
): Promise<PaymentReminder[]> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT 
        id, "invoiceId", "userId", "clientId", "reminderType", "scheduledDate", "sentAt", "isSent",
        "createdAt", "updatedAt"
      FROM payment_reminders 
      WHERE "invoiceId" = $1
      ORDER BY "scheduledDate" ASC`,
      [invoiceId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      invoiceId: row.invoiceId,
      userId: row.userId,
      clientId: row.clientId,
      reminderType: row.reminderType,
      scheduledDate: new Date(row.scheduledDate),
      sentAt: row.sentAt ? new Date(row.sentAt) : null,
      isSent: row.isSent,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));
  } catch (error) {
    console.error('Error fetching payment reminders:', error);
    throw new AppError('Failed to fetch payment reminders', 500);
  } finally {
    client.release();
  }
};

/**
 * Mark a payment reminder as sent
 */
export const markReminderAsSent = async (
  reminderId: number
): Promise<PaymentReminder> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `UPDATE payment_reminders 
      SET "isSent" = TRUE, "sentAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING 
        id, "invoiceId", "userId", "clientId", "reminderType", "scheduledDate", "sentAt", "isSent",
        "createdAt", "updatedAt"`,
      [reminderId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Payment reminder not found', 404);
    }

    const row = result.rows[0];
    return {
      id: row.id,
      invoiceId: row.invoiceId,
      userId: row.userId,
      clientId: row.clientId,
      reminderType: row.reminderType,
      scheduledDate: new Date(row.scheduledDate),
      sentAt: row.sentAt ? new Date(row.sentAt) : null,
      isSent: row.isSent,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error marking reminder as sent:', error);
    throw new AppError('Failed to mark reminder as sent', 500);
  } finally {
    client.release();
  }
};

/**
 * Delete all payment reminders for an invoice
 */
export const deletePaymentRemindersByInvoiceId = async (
  invoiceId: number
): Promise<void> => {
  const client = await pool.connect();

  try {
    await client.query('DELETE FROM payment_reminders WHERE "invoiceId" = $1', [
      invoiceId,
    ]);
  } catch (error) {
    console.error('Error deleting payment reminders:', error);
    throw new AppError('Failed to delete payment reminders', 500);
  } finally {
    client.release();
  }
};

/**
 * Get all reminders that are due to be sent (scheduled date is today or past, and not yet sent)
 */
export const getDueReminders = async (): Promise<PaymentReminder[]> => {
  const client = await pool.connect();

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Use DATE() function to compare dates without time component
    // This ensures we match reminders scheduled for today or earlier
    const result = await client.query(
      `SELECT 
        id, "invoiceId", "userId", "clientId", "reminderType", "scheduledDate", "sentAt", "isSent",
        "createdAt", "updatedAt"
      FROM payment_reminders 
      WHERE DATE("scheduledDate") <= DATE($1) AND "isSent" = FALSE
      ORDER BY "scheduledDate" ASC`,
      [today]
    );

    console.log(`[getDueReminders] Query executed: Found ${result.rows.length} due reminders`);
    if (result.rows.length > 0) {
      console.log(`[getDueReminders] Sample reminders:`, result.rows.slice(0, 3).map((r: any) => ({
        id: r.id,
        invoiceId: r.invoiceId,
        scheduledDate: r.scheduledDate,
        isSent: r.isSent,
      })));
    }

    return result.rows.map((row) => ({
      id: row.id,
      invoiceId: row.invoiceId,
      userId: row.userId,
      clientId: row.clientId,
      reminderType: row.reminderType,
      scheduledDate: new Date(row.scheduledDate),
      sentAt: row.sentAt ? new Date(row.sentAt) : null,
      isSent: row.isSent,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));
  } catch (error) {
    console.error('Error fetching due reminders:', error);
    throw new AppError('Failed to fetch due reminders', 500);
  } finally {
    client.release();
  }
};

/**
 * Get all reminders that are due with full invoice and client details
 */
export const getDueRemindersWithDetails = async (): Promise<any[]> => {
  const client = await pool.connect();

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await client.query(
      `SELECT 
        pr.id AS reminder_id,
        pr."invoiceId",
        pr."userId",
        pr."clientId",
        pr."reminderType",
        pr."scheduledDate",
        pr."sentAt",
        pr."isSent",
        pr."createdAt" AS reminder_created_at,
        pr."updatedAt" AS reminder_updated_at,
        i."invoiceNumber",
        i."invoiceDate",
        i."dueDate",
        i."totalAmount",
        i.currency,
        i.invoice_file_name,
        i."paymentReminderRepetition",
        i."additionalNotes",
        i.status,
        u."fullName" AS user_full_name,
        u.email AS user_email,
        mc."fullName" AS client_full_name,
        mc.email AS client_email,
        mc."mobileNumber" AS client_mobile
      FROM payment_reminders pr
      INNER JOIN invoices i ON pr."invoiceId" = i.id
      INNER JOIN users u ON pr."userId" = u.id
      INNER JOIN master_clients mc ON pr."clientId" = mc.id
      WHERE DATE(pr."scheduledDate") <= DATE($1) 
        AND pr."isSent" = FALSE
        AND i.status != 'paid'
      ORDER BY pr."scheduledDate" ASC`,
      [today]
    );

    console.log(`[getDueRemindersWithDetails] Query executed: Found ${result.rows.length} due reminders with details`);

    return result.rows.map((row) => ({
      reminder: {
        id: row.reminder_id,
        invoiceId: row.invoiceId,
        userId: row.userId,
        clientId: row.clientId,
        reminderType: row.reminderType,
        scheduledDate: new Date(row.scheduledDate),
        sentAt: row.sentAt ? new Date(row.sentAt) : null,
        isSent: row.isSent,
        createdAt: new Date(row.reminder_created_at),
        updatedAt: new Date(row.reminder_updated_at),
      },
      invoice: {
        id: row.invoiceId,
        invoiceNumber: row.invoiceNumber,
        invoiceDate: new Date(row.invoiceDate),
        dueDate: new Date(row.dueDate),
        totalAmount: parseFloat(row.totalAmount),
        currency: row.currency,
        invoiceFileName: row.invoice_file_name,
        paymentReminderRepetition: row.paymentReminderRepetition,
        additionalNotes: row.additionalNotes,
        status: row.status,
      },
      user: {
        id: row.userId,
        fullName: row.user_full_name,
        email: row.user_email,
      },
      client: {
        id: row.clientId,
        fullName: row.client_full_name,
        email: row.client_email,
        mobileNumber: row.client_mobile,
      },
    }));
  } catch (error) {
    console.error('Error fetching due reminders with details:', error);
    throw new AppError('Failed to fetch due reminders with details', 500);
  } finally {
    client.release();
  }
};

