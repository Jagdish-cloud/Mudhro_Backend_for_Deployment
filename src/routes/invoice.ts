import express from 'express';
import multer from 'multer';
import {
  createInvoice,
  getInvoicesByUserId,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  updateInvoicePdfFilename,
  sendInvoiceEmail,
} from '../services/invoiceService';
import { validateCreateInvoice, validateUpdateInvoice } from '../middleware/invoiceValidator';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { decodeId, urlDecode } from '../utils/urlEncoder';
import BlobStorageService, { FileType } from '../services/blobStorageService';
import { getDueReminders, getDueRemindersWithDetails, createPaymentReminders, createAutomatedReminder } from '../services/paymentReminderService';

const router = express.Router();

/**
 * Helper function to decode an invoice ID from req.params.id
 * Handles both numeric IDs and encoded IDs (Hashids or base64url)
 */
const decodeInvoiceId = (paramId: string): number | null => {
  if (!paramId || typeof paramId !== 'string') {
    return null;
  }
  
  // If it's already a number, return it
  if (/^\d+$/.test(paramId)) {
    return parseInt(paramId, 10);
  }
  
  // Try Hashids decoding first
  let decoded = decodeId(paramId);
  
  // If Hashids decoding fails, try base64url decoding (frontend encoding)
  if (decoded === null) {
    try {
      const base64Decoded = urlDecode(paramId);
      const numericId = parseInt(base64Decoded, 10);
      if (!isNaN(numericId) && numericId > 0) {
        decoded = numericId;
        console.log(`[Invoice Route] Successfully decoded base64url: ${paramId} -> ${decoded}`);
      }
    } catch (error) {
      console.warn(`[Invoice Route] Failed to decode ID "${paramId}":`, error);
    }
  } else {
    console.log(`[Invoice Route] Successfully decoded Hashids: ${paramId} -> ${decoded}`);
  }
  
  return decoded;
};

const invoicePdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    // Check MIME type
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('Only PDF files are allowed'));
      return;
    }
    cb(null, true);
  },
});

/**
 * @route   POST /api/invoices
 * @desc    Create a new invoice
 * @access  Private
 */
router.post(
  '/',
  authenticateToken,
  validateCreateInvoice,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const invoiceData = {
        ...req.body,
        userId: req.user.userId,
      };

      const invoice = await createInvoice(invoiceData);

      res.status(201).json({
        success: true,
        message: 'Invoice created successfully',
        invoice,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/invoices/reminders/due
 * @desc    Analyze invoices and send reminder emails based on due date conditions
 * @access  Public (for cron jobs)
 * @note    This endpoint analyzes invoices with status != "paid" and checks for:
 *          - 3 days before due date
 *          - On due date
 *          - 7 days after due date
 *          Sends reminder emails using the existing sendInvoiceEmail method
 */
router.get('/reminders/due', async (req, res, next) => {
  const pool = (await import('../config/database')).default;
  const client = await pool.connect();

  try {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Set to midnight for accurate date comparison

    // Calculate the target dates
    const threeDaysBefore = new Date(now);
    threeDaysBefore.setDate(threeDaysBefore.getDate() + 3);
    threeDaysBefore.setHours(0, 0, 0, 0);

    const onDueDate = new Date(now);
    onDueDate.setHours(0, 0, 0, 0);

    const sevenDaysAfter = new Date(now);
    sevenDaysAfter.setDate(sevenDaysAfter.getDate() - 7);
    sevenDaysAfter.setHours(0, 0, 0, 0);

    const tenDaysAfter = new Date(now);
    tenDaysAfter.setDate(tenDaysAfter.getDate() - 10);
    tenDaysAfter.setHours(0, 0, 0, 0);

    const fifteenDaysAfter = new Date(now);
    fifteenDaysAfter.setDate(fifteenDaysAfter.getDate() - 15);
    fifteenDaysAfter.setHours(0, 0, 0, 0);

    console.log(`[Reminders API] Checking reminders for date: ${now.toISOString().split('T')[0]}`);
    console.log(`[Reminders API] Target dates - 3 days before: ${threeDaysBefore.toISOString().split('T')[0]}, On due date: ${onDueDate.toISOString().split('T')[0]}, 7 days after: ${sevenDaysAfter.toISOString().split('T')[0]}, 10 days after: ${tenDaysAfter.toISOString().split('T')[0]}, 15 days after: ${fifteenDaysAfter.toISOString().split('T')[0]}`);

    // Fetch all invoices where status is NOT 'paid' (include clientId for reminder records)
    const invoiceResult = await client.query(
      `SELECT 
        i.id,
        i."userId",
        i."clientId",
        i."dueDate",
        i.status,
        i."invoiceNumber"
      FROM invoices i
      WHERE (i.status != 'paid' OR i.status IS NULL)
        AND i."paymentReminderRepetition" IS NOT NULL
        AND i."paymentReminderRepetition" != ''
      ORDER BY i."dueDate" ASC`,
      []
    );

    const invoices = invoiceResult.rows;
    console.log(`[Reminders API] Found ${invoices.length} invoices with status != 'paid'`);

    const processedInvoices: Array<{
      invoiceId: number;
      invoiceNumber: string;
      condition: string;
      dueDate: string;
      status: 'sent' | 'skipped' | 'error';
      message?: string;
    }> = [];

    // Process each invoice
    for (const invoice of invoices) {
      const dueDate = new Date(invoice.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      let conditionMatched: string | null = null;

      // Check if due date matches any of the conditions and map to reminder types
      let reminderType: string | null = null;
      if (dueDate.getTime() === threeDaysBefore.getTime()) {
        conditionMatched = '3 days before due date';
        reminderType = '3';
      } else if (dueDate.getTime() === onDueDate.getTime()) {
        conditionMatched = 'on due date';
        reminderType = 'Only on Due date';
      } else if (dueDate.getTime() === sevenDaysAfter.getTime()) {
        conditionMatched = '7 days after due date';
        reminderType = '7';
      } else if (dueDate.getTime() === tenDaysAfter.getTime()) {
        conditionMatched = '10 days after due date';
        reminderType = '10';
      } else if (dueDate.getTime() === fifteenDaysAfter.getTime()) {
        conditionMatched = '15 days after due date';
        reminderType = '15';
      }

      if (conditionMatched && reminderType) {
        try {
          console.log(`[Reminders API] Invoice #${invoice.invoiceNumber} (ID: ${invoice.id}) matches condition: ${conditionMatched}, due date: ${dueDate.toISOString().split('T')[0]}, reminder type: ${reminderType}`);

          // Send reminder email using the existing method
          await sendInvoiceEmail(
            invoice.id,
            invoice.userId,
            'reminder',
            true, // skipOverdueCheck = true for automatic reminders
            true  // skipReminderRecord = true for automatic reminders (we'll create automated record instead)
          );

          // Create new reminder record in database after successful email send
          try {
            const reminderRecord = await createAutomatedReminder(
              invoice.id,
              invoice.userId,
              invoice.clientId,
              reminderType,
              now // Use current date as scheduledDate (when the reminder was actually sent)
            );

            console.log(`[Reminders API] ✅ New reminder record created (ID: ${reminderRecord.id}) for invoice #${invoice.invoiceNumber}`);
          } catch (reminderError: any) {
            // Log error but don't fail the entire process if reminder record creation fails
            console.error(`[Reminders API] ⚠️ Failed to create reminder record for invoice #${invoice.invoiceNumber}:`, reminderError.message);
          }

          processedInvoices.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            condition: conditionMatched,
            dueDate: dueDate.toISOString().split('T')[0],
            status: 'sent',
            message: 'Reminder email sent successfully'
          });

          console.log(`[Reminders API] ✅ Reminder email sent for invoice #${invoice.invoiceNumber}`);
        } catch (error: any) {
          console.error(`[Reminders API] ❌ Error sending reminder for invoice #${invoice.invoiceNumber}:`, error);

          processedInvoices.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            condition: conditionMatched,
            dueDate: dueDate.toISOString().split('T')[0],
            status: 'error',
            message: error.message || 'Failed to send reminder email'
          });
        }
    } else {
        // Log skipped invoices for debugging (optional, can be removed in production)
        // console.log(`[Reminders API] Invoice #${invoice.invoiceNumber} (ID: ${invoice.id}) does not match any condition, due date: ${dueDate.toISOString().split('T')[0]}`);
      }
    }

    const sentCount = processedInvoices.filter(p => p.status === 'sent').length;
    const errorCount = processedInvoices.filter(p => p.status === 'error').length;

    console.log(`[Reminders API] Processing complete: ${sentCount} sent, ${errorCount} errors`);

      res.status(200).json({
        success: true,
      message: 'Reminder processing completed',
      summary: {
        totalInvoicesChecked: invoices.length,
        remindersSent: sentCount,
        errors: errorCount,
      },
      processedInvoices,
      });
  } catch (error) {
    console.error('[Reminders API] Error processing reminders:', error);
    next(error);
  } finally {
    client.release();
  }
});

/**
 * @route   GET /api/invoices/reminders/debug
 * @desc    Debug endpoint to check reminder status and diagnose issues
 * @access  Public (for debugging)
 */
router.get('/reminders/debug', async (req, res, next) => {
  try {
    const pool = (await import('../config/database')).default;
    const client = await pool.connect();

    try {
      // Get all reminders (regardless of status)
      const allReminders = await client.query(
        `SELECT 
          id, "invoiceId", "userId", "clientId", "reminderType", 
          "scheduledDate", "sentAt", "isSent", "createdAt", "updatedAt"
        FROM payment_reminders 
        ORDER BY "scheduledDate" ASC 
        LIMIT 50`
      );

      // Get invoices with paymentReminderRepetition
      const invoicesWithRepetition = await client.query(
        `SELECT 
          id, "invoiceNumber", "dueDate", "paymentReminderRepetition", "createdAt"
        FROM invoices 
        WHERE "paymentReminderRepetition" IS NOT NULL
        ORDER BY "createdAt" DESC
        LIMIT 20`
      );

      // Get invoices without reminders but with repetition set
      const invoicesWithoutReminders = await client.query(
        `SELECT 
          i.id, i."invoiceNumber", i."dueDate", i."paymentReminderRepetition", i."createdAt"
        FROM invoices i
        WHERE i."paymentReminderRepetition" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM payment_reminders pr WHERE pr."invoiceId" = i.id
        )
        ORDER BY i."createdAt" DESC
        LIMIT 20`
      );

      // Get current date info
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      res.status(200).json({
        success: true,
        debug: {
          currentDate: today.toISOString(),
          allReminders: {
            total: allReminders.rows.length,
            sent: allReminders.rows.filter((r: any) => r.isSent).length,
            notSent: allReminders.rows.filter((r: any) => !r.isSent).length,
            due: allReminders.rows.filter((r: any) => {
              const scheduled = new Date(r.scheduledDate);
              scheduled.setHours(0, 0, 0, 0);
              return scheduled <= today && !r.isSent;
            }).length,
            reminders: allReminders.rows.map((r: any) => ({
              id: r.id,
              invoiceId: r.invoiceId,
              reminderType: r.reminderType,
              scheduledDate: r.scheduledDate,
              isSent: r.isSent,
              sentAt: r.sentAt,
              daysUntilScheduled: Math.ceil((new Date(r.scheduledDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
            })),
          },
          invoicesWithRepetition: {
            total: invoicesWithRepetition.rows.length,
            invoices: invoicesWithRepetition.rows.map((inv: any) => ({
              id: inv.id,
              invoiceNumber: inv.invoiceNumber,
              dueDate: inv.dueDate,
              paymentReminderRepetition: inv.paymentReminderRepetition,
              createdAt: inv.createdAt,
            })),
          },
          invoicesWithoutReminders: {
            total: invoicesWithoutReminders.rows.length,
            invoices: invoicesWithoutReminders.rows.map((inv: any) => ({
              id: inv.id,
              invoiceNumber: inv.invoiceNumber,
              dueDate: inv.dueDate,
              paymentReminderRepetition: inv.paymentReminderRepetition,
              createdAt: inv.createdAt,
            })),
          },
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[Reminders Debug] Error:', error);
    next(error);
  }
});

/**
 * @route   POST /api/invoices/reminders/sync
 * @desc    Sync payment reminders for all invoices that have paymentReminderRepetition set but no reminders
 * @access  Public (for admin/cron jobs)
 * @note    This will create reminders for invoices that have paymentReminderRepetition but no reminders
 */
router.post('/reminders/sync', async (req, res, next) => {
  try {
    const pool = (await import('../config/database')).default;
    const client = await pool.connect();

    try {
      // Find invoices with paymentReminderRepetition but no reminders
      // Skip invoices that are marked as PAID
      const invoicesResult = await client.query(
        `SELECT 
          i.id,
          i."userId",
          i."clientId",
          i."dueDate",
          i."paymentReminderRepetition",
          i.status
        FROM invoices i
        WHERE i."paymentReminderRepetition" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM payment_reminders pr 
          WHERE pr."invoiceId" = i.id
        )
        AND i.status != 'paid'
        ORDER BY i.id ASC`
      );

      const invoices = invoicesResult.rows;
      const createdReminders = [];
      const skippedInvoices = [];

      console.log(`[Sync Reminders] Found ${invoices.length} invoices without reminders (PAID invoices excluded)`);

      for (const invoice of invoices) {
        if (invoice.paymentReminderRepetition) {
          // Double-check if invoice is PAID (should already be filtered by query, but check again for safety)
          if (invoice.status === 'paid') {
            console.log(`[Sync Reminders] Skipping invoice ${invoice.id}: Invoice is marked as PAID`);
            skippedInvoices.push({ invoiceId: invoice.id, reason: 'Invoice is PAID' });
            continue;
          }

          try {
            const reminders = await createPaymentReminders(
              invoice.id,
              invoice.dueDate,
              invoice.paymentReminderRepetition
            );
            if (reminders.length > 0) {
              createdReminders.push({
                invoiceId: invoice.id,
                remindersCreated: reminders.length,
              });
              console.log(`[Sync Reminders] Created ${reminders.length} reminders for invoice ${invoice.id}`);
            } else {
              console.log(`[Sync Reminders] No reminders created for invoice ${invoice.id} (may be PAID or invalid)`);
            }
          } catch (error: any) {
            console.error(`[Sync Reminders] Error creating reminders for invoice ${invoice.id}:`, error);
          }
        }
      }

      res.status(200).json({
        success: true,
        message: 'Reminders synced successfully',
        invoicesProcessed: invoices.length,
        remindersCreated: createdReminders,
        skipped: skippedInvoices,
        summary: {
          totalInvoices: invoices.length,
          remindersCreated: createdReminders.reduce((sum, r) => sum + r.remindersCreated, 0),
          skipped: skippedInvoices.length,
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[Sync Reminders] Error:', error);
    next(error);
  }
});

/**
 * @route   GET /api/invoices/email/test
 * @desc    Test email configuration and send a test email
 * @access  Public (for debugging)
 * @query   to (optional): Email address to send test email to
 */
router.get('/email/test', async (req, res, next) => {
  try {
    const { to } = req.query;
    const testEmail = (to as string) || process.env.GMAIL_USER;

    if (!testEmail) {
      return res.status(400).json({
        success: false,
        message: 'No email address provided. Use ?to=your-email@example.com',
      });
    }

    console.log('[Email Test] Testing email configuration...');
    console.log('[Email Test] GMAIL_USER:', process.env.GMAIL_USER ? 'Set' : 'NOT SET');
    console.log('[Email Test] GMAIL_APP_PASSWORD:', process.env.GMAIL_APP_PASSWORD ? 'Set' : 'NOT SET');
    console.log('[Email Test] Test email to:', testEmail);

    const { sendMail } = await import('../services/mailer');

    await sendMail({
      to: testEmail,
      subject: 'Mudhro Email Test',
      html: `
        <h2>Email Test Successful!</h2>
        <p>If you're reading this, your email configuration is working correctly.</p>
        <p>This is a test email from Mudhro Invoicing System.</p>
        <p>Timestamp: ${new Date().toISOString()}</p>
      `,
      text: 'Email Test Successful! If you\'re reading this, your email configuration is working correctly.',
    });

    res.status(200).json({
      success: true,
      message: 'Test email sent successfully',
      sentTo: testEmail,
    });
  } catch (error: any) {
    console.error('[Email Test] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: error.message,
      details: {
        gmailUserSet: !!process.env.GMAIL_USER,
        gmailAppPasswordSet: !!process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
});

/**
 * @route   GET /api/invoices
 * @desc    Get all invoices for the authenticated user
 * @access  Private
 */
router.get('/', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const invoices = await getInvoicesByUserId(req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Invoices retrieved successfully',
      invoices,
      count: invoices.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/invoices/:id
 * @desc    Get a specific invoice by ID
 * @access  Private
 */
router.get('/:id', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    // The ID should already be decoded by middleware, but decode here as fallback
    const paramId = req.params.id;
    console.log(`[Invoice Route] Getting invoice with param ID: ${paramId}`);

    const invoiceId = decodeInvoiceId(paramId);
    if (invoiceId === null || invoiceId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invoice ID',
      });
    }

    const invoice = await getInvoiceById(invoiceId, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Invoice retrieved successfully',
      invoice,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/invoices/:id
 * @desc    Update an invoice
 * @access  Private
 */
router.put(
  '/:id',
  authenticateToken,
  validateUpdateInvoice,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const invoiceId = decodeInvoiceId(req.params.id);
      if (invoiceId === null || invoiceId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid invoice ID',
        });
      }

      const invoice = await updateInvoice(invoiceId, req.user.userId, req.body);

      res.status(200).json({
        success: true,
        message: 'Invoice updated successfully',
        invoice,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/invoices/:id
 * @desc    Delete an invoice
 * @access  Private
 */
router.delete('/:id', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const invoiceId = decodeInvoiceId(req.params.id);
    if (invoiceId === null || invoiceId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invoice ID',
      });
    }

    await deleteInvoice(invoiceId, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Invoice deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/invoices/:id/pdf
 * @desc    Upload and store invoice PDF
 * @access  Private
 */
router.post(
  '/:id/pdf',
  authenticateToken,
  invoicePdfUpload.single('invoicePdf'),
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No PDF file provided',
        });
      }

      const invoiceId = decodeInvoiceId(req.params.id);
      if (invoiceId === null || invoiceId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid invoice ID',
        });
      }

      const invoice = await getInvoiceById(invoiceId, req.user.userId);

      const fileName = req.file.originalname || `${invoice.invoiceNumber}.pdf`;

      // Upload to Azure Blob Storage
      const blobPath = await BlobStorageService.uploadFile(
        req.file.buffer,
        fileName,
        FileType.INVOICE,
        req.user.userId,
        req.file.mimetype
      );

      // Delete old file if it exists and has a different name
      if (invoice.invoiceFileName && invoice.invoiceFileName !== fileName) {
        // Construct old blob path using the same pattern as uploadFile generates
        // Format: "Invoices/{userId}/{fileName}"
        const oldBlobPath = `Invoices/${req.user.userId}/${invoice.invoiceFileName}`;
        await BlobStorageService.deleteFile(oldBlobPath);
      }

      try {
        await updateInvoicePdfFilename(invoiceId, req.user.userId, fileName);
      } catch (error) {
        // Rollback blob upload if database update fails
        await BlobStorageService.deleteFile(blobPath);
        throw error;
      }

      res.status(200).json({
        success: true,
        message: 'Invoice PDF uploaded successfully',
        invoiceFileName: fileName,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/invoices/:id/pdf
 * @desc    Download invoice PDF
 * @access  Private
 */
router.get('/:id/pdf', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const invoiceId = decodeInvoiceId(req.params.id);
    if (invoiceId === null || invoiceId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invoice ID',
      });
    }

    const invoice = await getInvoiceById(invoiceId, req.user.userId);

    const fileName = invoice.invoiceFileName && invoice.invoiceFileName.trim() !== ''
      ? invoice.invoiceFileName
      : invoice.invoiceNumber.endsWith('.pdf')
        ? invoice.invoiceNumber
        : `${invoice.invoiceNumber}.pdf`;
    
    // Download from Azure Blob Storage (required - no local fallback)
    const blobPath = `Invoices/${req.user.userId}/${fileName}`;
    const fileData = await BlobStorageService.downloadFile(blobPath);

    res.setHeader('Content-Type', fileData.contentType);
    res.setHeader('Content-Length', fileData.contentLength);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(fileData.buffer);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/invoices/:id/email
 * @desc    Send invoice email (initial or reminder)
 * @access  Private
 */
router.post('/:id/email', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const invoiceId = decodeInvoiceId(req.params.id);
    if (invoiceId === null || invoiceId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invoice ID',
      });
    }

    const { type } = req.body as { type?: 'invoice' | 'reminder' | 'update' };

    if (type !== 'invoice' && type !== 'reminder' && type !== 'update') {
      return res.status(400).json({
        success: false,
        message: 'Email type must be "invoice", "update", or "reminder".',
      });
    }

    console.log(`[Invoice Route] Sending ${type} email for invoice ID: ${invoiceId}, User ID: ${req.user.userId}`);

    await sendInvoiceEmail(invoiceId, req.user.userId, type);

    console.log(`[Invoice Route] ✅ Email sent successfully for invoice ID: ${invoiceId}`);

    res.status(200).json({
      success: true,
      message: `Invoice ${type === 'invoice' ? 'delivery' : 'reminder'} email sent successfully`,
    });
  } catch (error: any) {
    console.error(`[Invoice Route] ❌ Error sending email:`, error);
    console.error(`[Invoice Route] Error details:`, {
      message: error.message,
      code: error.code,
      stack: error.stack,
    });
    next(error);
  }
});

export default router;
