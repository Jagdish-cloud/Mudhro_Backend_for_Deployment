import pool from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { createInvoice, generateInvoicePdf, updateInvoicePdfFilename } from './invoiceService';
import { createItem, getItemsByUserId } from './itemService';
import { getClientsByProjectId } from './projectClientService';
import { InvoiceItemCreateData, InvoiceCreateData } from '../types/invoice';
import BlobStorageService, { FileType } from './blobStorageService';

export interface ProcessMilestoneInvoicesResult {
  processed: number;
  created: number;
  failed: number;
  errors: Array<{ milestoneId: number; error: string }>;
}

/**
 * Get or create an item by name (case-insensitive)
 * @param userId - The user ID
 * @param itemName - The item name to search for or create
 * @returns The item ID
 */
const getOrCreateItemByName = async (
  userId: number,
  itemName: string
): Promise<number> => {
  try {
    // Check if item exists with matching name (case-insensitive)
    const items = await getItemsByUserId(userId);
    const existingItem = items.find(
      (item) => item.name.toLowerCase() === itemName.toLowerCase()
    );

    if (existingItem) {
      return existingItem.id;
    }

    // Create new item if not found
    const newItem = await createItem({
      name: itemName,
      userId: userId,
    });

    return newItem.id;
  } catch (error) {
    console.error(`Error getting/creating item "${itemName}":`, error);
    throw error;
  }
};

/**
 * Process milestones and create invoices for milestones due today
 * Checks for milestones with milestoneDate = today and status = 'pending',
 * then creates invoices for each associated client
 * 
 * Behavior:
 * - Only processes milestones with status = 'pending' (default status)
 * - Creates invoices for all pending milestones on the current date
 * - Updates milestone status to 'created' after processing (regardless of success/failure)
 */
export const processMilestoneInvoices = async (): Promise<ProcessMilestoneInvoicesResult> => {
  const client = await pool.connect();
  const result: ProcessMilestoneInvoicesResult = {
    processed: 0,
    created: 0,
    failed: 0,
    errors: [],
  };

  try {
    // Get today's date from the machine's local timezone
    // Use the machine's local date directly - no timezone conversion needed
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    
    console.log(`[Milestone Invoice Service] Checking for milestones on date: ${todayStr}`);
    
    // Use machine's local date (todayStr) to match milestones
    // This ensures we use the application server's date, not the database server's date
    // Cast the string to DATE type for proper comparison
    const milestonesResult = await client.query(
      `SELECT 
        apm.id,
        apm."agreementPaymentTermId",
        apm.description,
        apm.amount,
        apm."milestoneDate",
        apm.status,
        apt."agreementId",
        a."projectId",
        a."userId",
        a."serviceType"
      FROM agreement_payment_milestones apm
      INNER JOIN agreement_payment_terms apt ON apt.id = apm."agreementPaymentTermId"
      INNER JOIN agreements a ON a.id = apt."agreementId"
      WHERE apm."milestoneDate" = $1::date
        AND (apm.status = 'pending' OR apm.status IS NULL)
      ORDER BY apm.id`,
      [todayStr]
    );

    const milestones = milestonesResult.rows;

    if (milestones.length === 0) {
      console.log(`[Milestone Invoice Service] No milestones due today (${todayStr}) with status 'pending'`);
      return result;
    }

    console.log(`[Milestone Invoice Service] Found ${milestones.length} milestone(s) due today`);

    // Process each milestone
    for (const milestone of milestones) {
      result.processed++;

      try {
        const milestoneId = milestone.id;
        const agreementId = milestone.agreementId;
        const projectId = milestone.projectId;
        const userId = milestone.userId;
        const serviceType = milestone.serviceType;
        const milestoneAmount = parseFloat(milestone.amount);
        const milestoneDate = milestone.milestoneDate;
        const milestoneDescription = milestone.description;

        console.log(
          `[Milestone Invoice Service] Processing milestone ${milestoneId} for agreement ${agreementId}`
        );

        // Get all clients for the project
        const clients = await getClientsByProjectId(projectId, userId);

        if (clients.length === 0) {
          console.warn(
            `[Milestone Invoice Service] No clients found for project ${projectId}, skipping milestone ${milestoneId}`
          );
          result.failed++;
          result.errors.push({
            milestoneId,
            error: `No clients found for project ${projectId}`,
          });
          continue;
        }

        // Get or create item with name = serviceType
        let itemId: number;
        try {
          itemId = await getOrCreateItemByName(userId, serviceType);
        } catch (error: any) {
          console.error(
            `[Milestone Invoice Service] Error getting/creating item for milestone ${milestoneId}:`,
            error
          );
          result.failed++;
          result.errors.push({
            milestoneId,
            error: `Failed to get/create item: ${error.message}`,
          });
          continue;
        }

        // Create invoice for each client
        let invoicesCreatedForMilestone = 0;
        let invoicesFailedForMilestone = 0;

        for (const projectClient of clients) {
          try {
            // Format milestoneDate as YYYY-MM-DD string
            const invoiceDateStr =
              typeof milestoneDate === 'string'
                ? milestoneDate
                : new Date(milestoneDate).toISOString().split('T')[0];
            const dueDateStr = invoiceDateStr; // Same as invoiceDate for now

            // Create invoice item
            const invoiceItem: InvoiceItemCreateData = {
              itemsId: itemId,
              quantity: 1,
              unitPrice: milestoneAmount,
            };

            // Prepare invoice data
            const invoiceData: InvoiceCreateData = {
              userId: userId,
              clientId: projectClient.id,
              projectId: projectId,
              invoiceDate: invoiceDateStr,
              dueDate: dueDateStr,
              subTotalAmount: milestoneAmount,
              gst: 0, // No GST by default
              totalAmount: milestoneAmount,
              items: [invoiceItem],
              additionalNotes:
                milestoneDescription ||
                `Invoice for milestone: ${serviceType}`,
              paymentTerms: 'full',
            };

            // Create the invoice
            const invoice = await createInvoice(invoiceData);

            console.log(
              `[Milestone Invoice Service] Created invoice ${invoice.invoiceNumber} for client ${projectClient.id} (milestone ${milestoneId})`
            );

            // Generate and upload PDF
            try {
              console.log(
                `[Milestone Invoice Service] Generating PDF for invoice ${invoice.invoiceNumber}`
              );
              
              const pdfBuffer = await generateInvoicePdf(invoice.id, userId);
              const fileName = `${invoice.invoiceNumber}.pdf`;
              
              // Upload to Azure Blob Storage
              const blobPath = await BlobStorageService.uploadFile(
                pdfBuffer,
                fileName,
                FileType.INVOICE,
                userId,
                'application/pdf'
              );

              // Update invoice record with PDF filename
              await updateInvoicePdfFilename(invoice.id, userId, fileName);

              console.log(
                `[Milestone Invoice Service] PDF generated and uploaded for invoice ${invoice.invoiceNumber}`
              );
            } catch (pdfError: any) {
              console.error(
                `[Milestone Invoice Service] Error generating/uploading PDF for invoice ${invoice.invoiceNumber}:`,
                pdfError
              );
              // Don't fail invoice creation if PDF generation fails - invoice is still created
              // Log the error but continue
            }

            invoicesCreatedForMilestone++;
            result.created++;
          } catch (error: any) {
            console.error(
              `[Milestone Invoice Service] Error creating invoice for client ${projectClient.id} (milestone ${milestoneId}):`,
              error
            );
            invoicesFailedForMilestone++;
            result.failed++;
            result.errors.push({
              milestoneId,
              error: `Failed to create invoice for client ${projectClient.id}: ${error.message}`,
            });
            // Continue with next client even if one fails
          }
        }

        // Log summary for this milestone
        console.log(
          `[Milestone Invoice Service] Milestone ${milestoneId}: ${invoicesCreatedForMilestone} created, ${invoicesFailedForMilestone} failed`
        );

        // Update milestone status to 'created' after processing (regardless of success/failure)
        // This ensures we don't keep trying to process the same milestone
        await client.query(
          `UPDATE agreement_payment_milestones 
           SET status = 'created' 
           WHERE id = $1`,
          [milestoneId]
        );

        console.log(
          `[Milestone Invoice Service] Updated milestone ${milestoneId} status to 'created' (${invoicesCreatedForMilestone} invoice(s) created, ${invoicesFailedForMilestone} failed)`
        );
      } catch (error: any) {
        console.error(
          `[Milestone Invoice Service] Error processing milestone ${milestone.id}:`,
          error
        );
        result.failed++;
        result.errors.push({
          milestoneId: milestone.id,
          error: error.message || 'Unknown error',
        });
        // Continue with next milestone
      }
    }

    return result;
  } catch (error: any) {
    console.error('[Milestone Invoice Service] Fatal error:', error);
    throw new AppError(
      `Failed to process milestone invoices: ${error.message}`,
      500
    );
  } finally {
    client.release();
  }
};
