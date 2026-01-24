import express from 'express';
import { getMonthlyReportData, getAllActiveUsers } from '../services/monthlyReportService';
import { sendMail } from '../services/mailer';
import { decodeId, urlDecode } from '../utils/urlEncoder';
import puppeteer from 'puppeteer';
import BlobStorageService, { FileType } from '../services/blobStorageService';

const router = express.Router();

/**
 * @route   GET /api/monthly-reports/generate-all-pdfs
 * @desc    Generate PDFs from frontend page format for all active users
 * @access  Public (or Protected - adjust as needed)
 * @query   month (optional): Month number (1-12), defaults to previous month if run on 1st, otherwise current month
 * @query   year (optional): Year (e.g., 2025), defaults to current year (or previous year if month rolls back)
 * @query   frontendUrl (optional): Frontend URL, defaults to http://localhost:8081
 * 
 * @note    For end-of-month cronjobs:
 *          - If run on the 1st of the month: automatically generates reports for the previous month
 *          - If run on any other day: generates reports for the current month
 *          - Can also explicitly specify month/year via query parameters
 */
router.get('/generate-all-pdfs', async (req, res, next) => {
  try {
    const { month: monthParam, year: yearParam, frontendUrl } = req.query;
    
    // Always use previous month if no month/year params are provided
    // This is designed for cronjobs that run on the 2nd of every month for the previous month
    const now = new Date();
    let reportMonth: number;
    let reportYear: number;
    
    if (monthParam) {
      // Explicit month provided
      reportMonth = parseInt(monthParam as string, 10);
      reportYear = yearParam ? parseInt(yearParam as string, 10) : now.getFullYear();
    } else {
      // No params provided: always use previous month
      const currentMonth = now.getMonth() + 1; // 1-12
      const currentYear = now.getFullYear();
      
      // Calculate previous month
      if (currentMonth === 1) {
        // January -> December of previous year
        reportMonth = 12;
        reportYear = currentYear - 1;
      } else {
        // Any other month -> previous month of same year
        reportMonth = currentMonth - 1;
        reportYear = currentYear;
      }
      
      console.log(`[Monthly Report] No month/year params provided, generating reports for previous month: ${reportMonth}/${reportYear}`);
    }
    
    // Validate month and year
    if (reportMonth < 1 || reportMonth > 12) {
      return res.status(400).json({
        success: false,
        message: 'Invalid month. Must be between 1 and 12.',
      });
    }
    
    if (reportYear < 2000 || reportYear > 2100) {
      return res.status(400).json({
        success: false,
        message: 'Invalid year.',
      });
    }

    // Get all active users
    const users = await getAllActiveUsers();
    console.log(`[Monthly Report] Found ${users.length} active users to process`);

    if (users.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No active users found',
        timestamp: new Date().toISOString(),
      });
    }

    // Get frontend URL from query param or environment variable or default
    const frontendBaseUrl = (frontendUrl as string) || process.env.FRONTEND_URL || 'http://localhost:8081';

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    // Format month for Azure Blob Storage folder (YYYY-MM format)
    const monthFolder = `${reportYear}-${String(reportMonth).padStart(2, '0')}`;
    const timestamp = now.toISOString()
      .replace(/T/, '_')
      .replace(/:/g, '-')
      .replace(/\..+/, '');

    // Launch Puppeteer browser (reuse for all users)
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const results = {
      success: 0,
      failed: 0,
      emailsSent: 0,
      emailsFailed: 0,
      reports: [] as Array<{
        userId: number;
        userEmail: string;
        fileName: string;
        blobPath: string;
        emailSent: boolean;
      }>,
      errors: [] as string[],
      emailErrors: [] as string[],
    };

    try {
      // Process each user
      for (const user of users) {
        try {
          const userId = user.id;
          // Use numeric userId directly in the URL (frontend can handle both encoded and numeric IDs)
          const reportUrl = `${frontendBaseUrl}/monthly-report/${userId}?month=${reportMonth}&year=${reportYear}&bypassAuth=true`;

          console.log(`[Monthly Report] Generating PDF for user ${user.email} (ID: ${userId}), month ${reportMonth}/${reportYear}`);

          const page = await browser.newPage();
          
          try {
            // Set viewport for consistent rendering (A4 width at 96 DPI)
            await page.setViewport({ width: 794, height: 1123 }); // A4 dimensions in pixels at 96 DPI
            
            // Capture console errors and logs for debugging
            page.on('console', msg => {
              const type = msg.type();
              const text = msg.text();
              if (type === 'error') {
                console.error(`[Monthly Report] Browser console error for ${user.email}:`, text);
              } else if (text.includes('Monthly Report') || text.includes('API Response') || text.includes('Report data')) {
                console.log(`[Monthly Report] Browser console for ${user.email}:`, text);
              }
            });
            
            page.on('pageerror', (error: unknown) => {
              const errorMessage = error instanceof Error ? error.message : String(error);
              console.error(`[Monthly Report] Page error for ${user.email}:`, errorMessage);
            });
            
            // Navigate to the frontend page
            await page.goto(reportUrl, {
              waitUntil: 'networkidle2',
              timeout: 60000, // 60 seconds timeout
            });
            
            console.log(`[Monthly Report] Page loaded for ${user.email}, waiting for data...`);
            
            // Emulate print media to apply print styles
            await page.emulateMediaType('print');

            // Wait for the report data to actually load (not just the loader to disappear)
            try {
              await page.waitForFunction(
                () => {
                  // @ts-ignore - document is available in browser context
                  const loader = document.querySelector('.animate-spin');
                  // @ts-ignore - document is available in browser context
                  const reportContent = document.querySelector('[data-report-loaded]');
                  // @ts-ignore - document is available in browser context
                  const reportCards = document.querySelectorAll('[class*="Card"]');
                  // @ts-ignore - document is available in browser context
                  const summaryCards = document.querySelectorAll('.grid-cols-1, .grid-cols-2, .grid-cols-4');
                  // @ts-ignore - document is available in browser context
                  const tables = document.querySelectorAll('table');
                  // @ts-ignore - document is available in browser context
                  const bodyText = document.body.textContent || '';
                  
                  // Check if loader is gone
                  // @ts-ignore - HTMLElement is available in browser context
                  const loaderHidden = !loader || (loader as HTMLElement).style.display === 'none' || !document.body.contains(loader);
                  
                  // Check if data is loaded (either has content or has "no data" message)
                  const hasReportData = reportContent && reportContent.getAttribute('data-report-loaded') === 'true';
                  const hasContent = (reportCards.length > 2 || tables.length > 0 || summaryCards.length > 0);
                  const hasNoDataMessage = bodyText.includes('No reports available') || bodyText.includes('No report data available');
                  
                  // Data is loaded if: loader is hidden AND (report data attribute is true OR we have content OR we have no data message)
                  return loaderHidden && (hasReportData || hasContent || hasNoDataMessage);
                },
                { timeout: 45000, polling: 500 }
              );
              console.log(`[Monthly Report] Report data loaded for user ${user.email}`);
            } catch (error: any) {
              console.log(`[Monthly Report] Data load check timeout for user ${user.email}, checking page state...`, error?.message || error);
              // Check what's actually on the page
              const pageState = await page.evaluate(() => {
                // @ts-ignore - document is available in browser context
                const loader = document.querySelector('.animate-spin');
                // @ts-ignore - document is available in browser context
                const reportContent = document.querySelector('[data-report-loaded]');
                // @ts-ignore - document is available in browser context
                const cards = document.querySelectorAll('[class*="Card"]');
                // @ts-ignore - document is available in browser context
                const tables = document.querySelectorAll('table');
                // @ts-ignore - document is available in browser context
                const bodyText = document.body.textContent || '';
                // @ts-ignore - document is available in browser context
                const noData = bodyText.includes('No reports') || bodyText.includes('No report data');
                return {
                  hasLoader: !!loader,
                  hasReportDataAttr: reportContent ? reportContent.getAttribute('data-report-loaded') : null,
                  cardCount: cards.length,
                  tableCount: tables.length,
                  hasNoDataMessage: !!noData,
                  bodyText: bodyText.substring(0, 300)
                };
              });
              console.log(`[Monthly Report] Page state for ${user.email}:`, JSON.stringify(pageState, null, 2));
            }

            // Additional wait to ensure all content is fully rendered
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Verify data is actually present before generating PDF
            const hasData = await page.evaluate(() => {
              // @ts-ignore
              const cards = document.querySelectorAll('[class*="Card"]');
              // @ts-ignore
              const tables = document.querySelectorAll('table');
              // @ts-ignore
              const summaryCards = document.querySelectorAll('.grid-cols-1, .grid-cols-2, .grid-cols-4');
              // @ts-ignore
              const hasContent = (cards.length > 2 || tables.length > 0 || summaryCards.length > 0);
              // @ts-ignore
              const hasNoData = document.body.textContent?.includes('No reports available') || document.body.textContent?.includes('No report data available');
              return { hasContent, hasNoData, cardCount: cards.length, tableCount: tables.length };
            });
            
            if (!hasData.hasContent && !hasData.hasNoData) {
              console.warn(`[Monthly Report] Warning: No content detected for user ${user.email}. Card count: ${hasData.cardCount}, Table count: ${hasData.tableCount}`);
            } else {
              console.log(`[Monthly Report] Content verified for user ${user.email}. Cards: ${hasData.cardCount}, Tables: ${hasData.tableCount}`);
            }

            // Wait for any images or fonts to load
            await page.evaluateHandle('document.fonts.ready');
            
            // Force hide sidebar and header for PDF generation
            await page.evaluate(() => {
              // @ts-ignore - document is available in browser context
              const header = document.querySelector('header');
              // @ts-ignore - document is available in browser context
              const sidebar = document.querySelector('aside');
              // @ts-ignore - document is available in browser context
              const sidebarContainer = document.querySelector('.w-64.border-r');
              
              if (header) {
                // @ts-ignore
                header.style.display = 'none';
                // @ts-ignore
                header.style.visibility = 'hidden';
              }
              if (sidebar) {
                // @ts-ignore
                sidebar.style.display = 'none';
                // @ts-ignore
                sidebar.style.visibility = 'hidden';
              }
              if (sidebarContainer) {
                // @ts-ignore
                sidebarContainer.style.display = 'none';
                // @ts-ignore
                sidebarContainer.style.visibility = 'hidden';
              }
            });

            // Generate filename
            const fileName = `Monthly_Report_${monthNames[reportMonth - 1]}_${reportYear}_${userId}_${timestamp}.pdf`;

            // Generate PDF with print media styles
            const pdfBuffer = await page.pdf({
              format: 'A4',
              margin: {
                top: '1cm',
                right: '1cm',
                bottom: '1cm',
                left: '1cm',
              },
              printBackground: true,
              preferCSSPageSize: true,
            });

            // Upload PDF to Azure Blob Storage
            const blobPath = await BlobStorageService.uploadFile(
              Buffer.from(pdfBuffer),
              fileName,
              FileType.MONTHLY_REPORT,
              userId, // relatedId (not used for MONTHLY_REPORT, but required by interface)
              'application/pdf',
              monthFolder // month parameter for folder structure
            );

            console.log(`[Monthly Report] PDF uploaded to Azure Blob Storage for user ${user.email}: ${blobPath}`);

            // Send email with PDF attachment
            let emailSent = false;
            try {
              const emailSubject = `Your ${monthNames[reportMonth - 1]} ${reportYear} Monthly Summary Report`;
              const emailHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
                    .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 5px 5px; }
                    .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
                    .button { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="header">
                      <h1>Monthly Summary Report</h1>
                    </div>
                    <div class="content">
                      <p>Dear ${user.fullName || user.email},</p>
                      <p>Your monthly summary report for <strong>${monthNames[reportMonth - 1]} ${reportYear}</strong> has been generated and is attached to this email.</p>
                      <p>This report includes:</p>
                      <ul>
                        <li>Invoice Summary</li>
                        <li>Expense Summary</li>
                        <li>GST Collected</li>
                        <li>Tax on Expenses</li>
                        <li>Net Tax Calculation</li>
                        <li>Pending Payments</li>
                        <li>Overdue Invoices</li>
                      </ul>
                      <p>Please find your detailed report attached as a PDF file.</p>
                      <p>If you have any questions or need assistance, please don't hesitate to contact us.</p>
                      <p>Best regards,<br><strong>Mudhro Invoicing Team</strong></p>
                    </div>
                    <div class="footer">
                      <p>This is an automated email. Please do not reply to this message.</p>
                    </div>
                  </div>
                </body>
                </html>
              `;

              await sendMail({
                to: user.email,
                subject: emailSubject,
                html: emailHtml,
                attachments: [
                  {
                    filename: fileName,
                    content: pdfBuffer,
                  } as any, // nodemailer supports content for attachments
                ],
              });

              emailSent = true;
              results.emailsSent++;
              console.log(`[Monthly Report] Email sent successfully to ${user.email}`);
            } catch (emailError: any) {
              emailSent = false;
              results.emailsFailed++;
              results.emailErrors.push(`${user.email}: ${emailError.message || 'Failed to send email'}`);
              console.error(`[Monthly Report] Failed to send email to ${user.email}:`, emailError);
              // Don't fail the entire process if email fails, PDF was generated successfully
            }

            results.success++;
            results.reports.push({
              userId,
              userEmail: user.email,
              fileName,
              blobPath,
              emailSent,
            });
          } finally {
            // Always close the page
            await page.close();
          }
        } catch (error: any) {
          console.error(`[Monthly Report] Failed to generate PDF for user ${user.email}:`, error);
          results.failed++;
          results.errors.push(`${user.email} (ID: ${user.id}): ${error.message || 'Unknown error'}`);
        }
      }
    } finally {
      // Always close the browser
      await browser.close();
    }

    res.status(200).json({
      success: true,
      message: `PDFs generated and emails sent for ${monthNames[reportMonth - 1]} ${reportYear}`,
      summary: {
        totalUsers: users.length,
        pdfsGenerated: results.success,
        pdfsFailed: results.failed,
        emailsSent: results.emailsSent,
        emailsFailed: results.emailsFailed,
        month: reportMonth,
        year: reportYear,
      },
      reports: results.reports,
      errors: results.errors.length > 0 ? results.errors : undefined,
      emailErrors: results.emailErrors.length > 0 ? results.emailErrors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Helper function to decode a user ID from req.params.userId
 * Handles both numeric IDs and encoded IDs (Hashids or base64url)
 */
const decodeUserId = (paramId: string): number | null => {
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
        console.log(`[Monthly Report Route] Successfully decoded base64url: ${paramId} -> ${decoded}`);
      }
    } catch (error) {
      console.warn(`[Monthly Report Route] Failed to decode ID "${paramId}":`, error);
    }
  } else {
    console.log(`[Monthly Report Route] Successfully decoded Hashids: ${paramId} -> ${decoded}`);
  }
  
  return decoded ?? null;
};

/**
 * @route   GET /api/monthly-reports/:userId
 * @desc    Get monthly report data for a specific user (JSON response)
 * @access  Public (or Protected - adjust as needed)
 * @query   month (optional): Month number (1-12), defaults to current month
 * @query   year (optional): Year (e.g., 2025), defaults to current year
 */
router.get('/:userId', async (req, res, next) => {
  try {
    console.log(`[Monthly Report API] Request received:`, {
      userId: req.params.userId,
      query: req.query,
      originalUrl: req.originalUrl,
    });
    
    const userId = decodeUserId(req.params.userId);
    const { month: monthParam, year: yearParam } = req.query;
    
    console.log(`[Monthly Report API] Decoded userId: ${userId}, monthParam: ${monthParam}, yearParam: ${yearParam}`);
    
    // Validate userId
    if (userId === null || userId <= 0) {
      console.error(`[Monthly Report API] Invalid userId: ${req.params.userId} -> ${userId}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID',
      });
    }
    
    // Use current month/year if not specified
    const now = new Date();
    let reportMonth = monthParam ? parseInt(monthParam as string, 10) : (now.getMonth() + 1);
    let reportYear = yearParam ? parseInt(yearParam as string, 10) : now.getFullYear();
    
    console.log(`[Monthly Report API] Parsed month: ${reportMonth}, year: ${reportYear}`);
    
    // Validate month and year
    if (isNaN(reportMonth) || reportMonth < 1 || reportMonth > 12) {
      console.error(`[Monthly Report API] Invalid month: ${monthParam} -> ${reportMonth}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid month. Must be between 1 and 12.',
      });
    }
    
    if (isNaN(reportYear) || reportYear < 2000 || reportYear > 2100) {
      console.error(`[Monthly Report API] Invalid year: ${yearParam} -> ${reportYear}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid year.',
      });
    }

    console.log(`[Monthly Report] Fetching report data for user ${userId}, month ${reportMonth}/${reportYear}`);
    
    // Get report data
    const reportData = await getMonthlyReportData(userId, reportMonth, reportYear);
    
    res.status(200).json({
      success: true,
      data: reportData,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
