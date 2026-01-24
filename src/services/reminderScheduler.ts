import { getDueRemindersWithDetails, markReminderAsSent } from './paymentReminderService';
import { sendInvoiceEmail } from './invoiceService';
import { AppError } from '../middleware/errorHandler';

/**
 * Process and send all due payment reminders
 * This function should be called periodically (e.g., every hour or daily)
 */
export const processDueReminders = async (): Promise<{
  processed: number;
  sent: number;
  failed: number;
  errors: Array<{ reminderId: number; error: string }>;
}> => {
  const results = {
    processed: 0,
    sent: 0,
    failed: 0,
    errors: [] as Array<{ reminderId: number; error: string }>,
  };

  try {
    console.log('[Reminder Scheduler] Starting to process due reminders...');
    
    // Get all due reminders with full details
    const dueReminders = await getDueRemindersWithDetails();
    
    console.log(`[Reminder Scheduler] Found ${dueReminders.length} due reminders to process`);

    if (dueReminders.length === 0) {
      console.log('[Reminder Scheduler] No due reminders to process');
      return results;
    }

    // Process each reminder
    for (const reminderData of dueReminders) {
      results.processed++;
      const reminder = reminderData.reminder;
      const invoice = reminderData.invoice;
      const client = reminderData.client;

      try {
        // Check if invoice status is PAID - skip automated reminders for paid invoices
        if (invoice.status === 'paid') {
          console.log(
            `[Reminder Scheduler] Skipping reminder ${reminder.id} for invoice ${invoice.invoiceNumber}: Invoice status is PAID`
          );
          // Mark reminder as sent to prevent future processing
          await markReminderAsSent(reminder.id);
          results.processed--; // Don't count as processed since we're skipping it
          continue;
        }

        // Check if client has email
        if (!client.email) {
          console.warn(
            `[Reminder Scheduler] Skipping reminder ${reminder.id} for invoice ${invoice.invoiceNumber}: Client email missing`
          );
          results.failed++;
          results.errors.push({
            reminderId: reminder.id,
            error: 'Client email is missing',
          });
          continue;
        }

        console.log(
          `[Reminder Scheduler] Sending reminder ${reminder.id} for invoice ${invoice.invoiceNumber} to ${client.email}`
        );

        // Send reminder email (skip overdue check for automatic reminders)
        await sendInvoiceEmail(reminder.invoiceId, reminder.userId, 'reminder', true);

        // Mark reminder as sent
        await markReminderAsSent(reminder.id);

        console.log(
          `[Reminder Scheduler] Successfully sent reminder ${reminder.id} for invoice ${invoice.invoiceNumber}`
        );
        results.sent++;
      } catch (error: any) {
        console.error(
          `[Reminder Scheduler] Failed to send reminder ${reminder.id} for invoice ${invoice.invoiceNumber}:`,
          error
        );
        results.failed++;
        results.errors.push({
          reminderId: reminder.id,
          error: error.message || 'Unknown error',
        });
        // Continue processing other reminders even if one fails
      }
    }

    console.log(
      `[Reminder Scheduler] Completed processing: ${results.sent} sent, ${results.failed} failed out of ${results.processed} total`
    );

    return results;
  } catch (error: any) {
    console.error('[Reminder Scheduler] Error processing due reminders:', error);
    throw new AppError('Failed to process due reminders', 500);
  }
};

