import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import pool from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { sendMail } from './mailer';

interface MonthlyReportData {
  userId: number;
  userFullName: string;
  userEmail: string;
  userGSTIN?: string | null;
  userPAN?: string | null;
  userLogo?: string | null;
  userCountry?: string | null;
  userCurrency?: string | null;
  month: string;
  year: number;
  monthNumber: number;
  startDate: Date;
  endDate: Date;
  totalInvoices: number;
  totalInvoiceAmount: number;
  totalExpenses: number;
  totalExpenseAmount: number;
  gstCollected: number;
  taxOnExpenses: number;
  netTax: number;
  pendingPayments: number;
  overdueInvoices: number;
  invoices: Array<{
    id: number;
    invoiceNumber: string;
    invoiceDate: Date;
    dueDate: Date;
    clientName: string;
    clientOrganization?: string | null;
    totalAmount: number;
    subTotalAmount: number;
    gst: number;
    gstAmount: number;
    currency: string;
    status: string;
  }>;
  expenses: Array<{
    id: number;
    billNumber: string;
    billDate: Date;
    vendorName: string;
    totalAmount: number;
    subTotalAmount: number;
    taxPercentage: number;
    taxAmount: number;
  }>;
  currencyBreakdown?: Array<{
    currency: string;
    invoiceCount: number;
    invoiceAmount: number;
    gstCollected: number;
    expenseCount: number;
    expenseAmount: number;
    taxOnExpenses: number;
    pendingPayments: number;
    overdueCount: number;
  }>;
}

/**
 * Get all active users
 */
export const getAllActiveUsers = async (): Promise<Array<{ id: number; fullName: string; email: string }>> => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, "fullName", email 
       FROM users 
       WHERE "isActive" = true AND email IS NOT NULL AND email != ''`
    );
    return result.rows;
  } finally {
    client.release();
  }
};

/**
 * Get monthly report data for a user
 */
export const getMonthlyReportData = async (
  userId: number,
  month: number,
  year: number
): Promise<MonthlyReportData> => {
  const client = await pool.connect();

  try {
    // Get user info including GSTIN, PAN, logo, currency
    const userResult = await client.query(
      `SELECT "fullName", email, gstin, pan, logo, country, currency FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    const user = userResult.rows[0];
    const userCurrency = user.currency || 'INR';
    // Create proper date range for the month
    // Start: first day of month at 00:00:00
    const startDate = new Date(year, month - 1, 1);
    startDate.setHours(0, 0, 0, 0);
    // End: last day of month at 23:59:59
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    // Format dates for PostgreSQL (YYYY-MM-DD format)
    const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    console.log(`[Monthly Report] Fetching data for user ${userId}, month ${month}/${year}`);
    console.log(`[Monthly Report] Date range: ${startDateStr} to ${endDateStr}`);

    // First, let's check what dates actually exist in the database for this user
    const debugInvoicesResult = await client.query(
      `SELECT 
        i.id,
        i."invoiceNumber",
        i."invoiceDate",
        i."userId",
        EXTRACT(YEAR FROM i."invoiceDate") AS invoice_year,
        EXTRACT(MONTH FROM i."invoiceDate") AS invoice_month,
        i."totalAmount"
      FROM invoices i
      WHERE i."userId" = $1
      ORDER BY i."invoiceDate" DESC
      LIMIT 10`,
      [userId]
    );
    
    // Also check ALL invoices in database to see which users have data
    const allInvoicesDebug = await client.query(
      `SELECT 
        i."userId",
        u.email,
        COUNT(*) as invoice_count,
        MIN(i."invoiceDate") as earliest_date,
        MAX(i."invoiceDate") as latest_date
      FROM invoices i
      LEFT JOIN users u ON i."userId" = u.id
      GROUP BY i."userId", u.email
      ORDER BY invoice_count DESC`
    );
    
    console.log(`[Monthly Report] Debug: Found ${debugInvoicesResult.rows.length} total invoices for user ${userId}`);
    console.log(`[Monthly Report] Debug: All users with invoices:`, allInvoicesDebug.rows);
    
    if (debugInvoicesResult.rows.length > 0) {
      console.log(`[Monthly Report] Debug: Sample invoices in database:`, debugInvoicesResult.rows.map((row: any) => ({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        invoiceDate: row.invoiceDate,
        year: row.invoice_year,
        month: row.invoice_month,
        totalAmount: row.totalAmount
      })));
    }

    // Get invoices for the month - use date comparison with proper casting
    const invoicesResult = await client.query(
      `SELECT 
        i.id,
        i."invoiceNumber",
        i."invoiceDate",
        i."dueDate",
        i."subTotalAmount",
        i."totalAmount",
        i.gst,
        i.currency,
        i."additionalNotes",
        i.status,
        mc."fullName" AS client_name,
        mc.organization AS client_organization
      FROM invoices i
      INNER JOIN master_clients mc ON i."clientId" = mc.id
      WHERE i."userId" = $1 
        AND i."invoiceDate" >= $2::date
        AND i."invoiceDate" <= $3::date
      ORDER BY i."invoiceDate" ASC`,
      [userId, startDateStr, endDateStr]
    );

    console.log(`[Monthly Report] Found ${invoicesResult.rows.length} invoices for ${month}/${year}`);
    if (invoicesResult.rows.length > 0) {
      // Log currency information for debugging
      const currenciesFound = [...new Set(invoicesResult.rows.map((row: any) => row.currency || 'NULL'))];
      console.log(`[Monthly Report] Currencies found in invoices:`, currenciesFound);
      console.log(`[Monthly Report] Sample invoice:`, {
        id: invoicesResult.rows[0].id,
        invoiceNumber: invoicesResult.rows[0].invoiceNumber,
        invoiceDate: invoicesResult.rows[0].invoiceDate,
        totalAmount: invoicesResult.rows[0].totalAmount,
        currency: invoicesResult.rows[0].currency || 'NULL',
        userCurrency: userCurrency
      });
    } else {
      console.log(`[Monthly Report] No invoices found for date range ${startDateStr} to ${endDateStr}`);
    }

    // First, let's check what dates actually exist in the database for this user
    const debugExpensesResult = await client.query(
      `SELECT 
        e.id,
        e."billNumber",
        e."billDate",
        e."userId",
        EXTRACT(YEAR FROM e."billDate") AS expense_year,
        EXTRACT(MONTH FROM e."billDate") AS expense_month,
        e."totalAmount"
      FROM expenses e
      WHERE e."userId" = $1
      ORDER BY e."billDate" DESC
      LIMIT 10`,
      [userId]
    );
    
    // Also check ALL expenses in database to see which users have data
    const allExpensesDebug = await client.query(
      `SELECT 
        e."userId",
        u.email,
        COUNT(*) as expense_count,
        MIN(e."billDate") as earliest_date,
        MAX(e."billDate") as latest_date
      FROM expenses e
      LEFT JOIN users u ON e."userId" = u.id
      GROUP BY e."userId", u.email
      ORDER BY expense_count DESC`
    );
    
    console.log(`[Monthly Report] Debug: Found ${debugExpensesResult.rows.length} total expenses for user ${userId}`);
    console.log(`[Monthly Report] Debug: All users with expenses:`, allExpensesDebug.rows);
    
    if (debugExpensesResult.rows.length > 0) {
      console.log(`[Monthly Report] Debug: Sample expenses in database:`, debugExpensesResult.rows.map((row: any) => ({
        id: row.id,
        billNumber: row.billNumber,
        billDate: row.billDate,
        year: row.expense_year,
        month: row.expense_month,
        totalAmount: row.totalAmount
      })));
    }

    // Get expenses for the month - use date comparison with proper casting
    const expensesResult = await client.query(
      `SELECT 
        e.id,
        e."billNumber",
        e."billDate",
        e."subTotalAmount",
        e."totalAmount",
        e."taxPercentage",
        v."fullName" AS vendor_name
      FROM expenses e
      INNER JOIN vendors v ON e."vendorId" = v.id
      WHERE e."userId" = $1 
        AND e."billDate" >= $2::date
        AND e."billDate" <= $3::date
      ORDER BY e."billDate" ASC`,
      [userId, startDateStr, endDateStr]
    );

    console.log(`[Monthly Report] Found ${expensesResult.rows.length} expenses for ${month}/${year}`);
    if (expensesResult.rows.length > 0) {
      console.log(`[Monthly Report] Sample expense:`, {
        id: expensesResult.rows[0].id,
        billNumber: expensesResult.rows[0].billNumber,
        billDate: expensesResult.rows[0].billDate,
        totalAmount: expensesResult.rows[0].totalAmount
      });
    } else {
      console.log(`[Monthly Report] No expenses found for date range ${startDateStr} to ${endDateStr}`);
    }

    const invoices = invoicesResult.rows.map((row) => {
      const totalAmount = parseFloat(row.totalAmount || 0);
      const subTotalAmount = parseFloat(row.subTotalAmount || 0);
      const gst = parseFloat(row.gst || 0);
      const gstAmount = totalAmount - subTotalAmount;
      // Use the invoice's currency if it exists, otherwise fall back to user's default currency
      // Important: Only fall back if currency is NULL/empty, not if it's explicitly set
      const invoiceCurrency = (row.currency && row.currency.trim() !== '') 
        ? row.currency 
        : (userCurrency || 'INR');
      
      // Use status from database, fallback to computed status if null
      let status: 'paid' | 'pending' | 'overdue' = row.status || 'pending';
      if (!row.status) {
        // Fallback: compute from dueDate if status is null
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(row.dueDate);
        due.setHours(0, 0, 0, 0);
        status = due < today ? 'overdue' : 'pending';
      }
      
      return {
        id: row.id,
        invoiceNumber: row.invoiceNumber || `INV-${row.id}`,
        invoiceDate: new Date(row.invoiceDate),
        dueDate: new Date(row.dueDate),
        clientName: row.client_name,
        clientOrganization: row.client_organization || null,
        totalAmount,
        subTotalAmount,
        gst,
        gstAmount,
        currency: invoiceCurrency,
        status,
      };
    });
    
    // Log currency breakdown after mapping
    const mappedCurrencies = [...new Set(invoices.map(inv => inv.currency))];
    console.log(`[Monthly Report] Mapped invoice currencies:`, mappedCurrencies);
    console.log(`[Monthly Report] Currency breakdown will be calculated for:`, mappedCurrencies);

    const expenses = expensesResult.rows.map((row) => {
      const totalAmount = parseFloat(row.totalAmount || 0);
      const subTotalAmount = parseFloat(row.subTotalAmount || 0);
      const taxPercentage = parseFloat(row.taxPercentage || 0);
      const taxAmount = totalAmount - subTotalAmount;
      
      return {
        id: row.id,
        billNumber: row.billNumber || `EXP-${row.id}`,
        billDate: new Date(row.billDate),
        vendorName: row.vendor_name,
        totalAmount,
        subTotalAmount,
        taxPercentage,
        taxAmount,
      };
    });

    // Calculate totals grouped by currency
    const currencyBreakdown: Record<string, {
      currency: string;
      invoiceCount: number;
      invoiceAmount: number;
      gstCollected: number;
      expenseCount: number;
      expenseAmount: number;
      taxOnExpenses: number;
      pendingPayments: number;
      overdueCount: number;
    }> = {};

    // Initialize currency breakdown for invoices
    invoices.forEach((inv) => {
      // Use the invoice's currency directly (already mapped with fallback)
      const currency = inv.currency || userCurrency || 'INR';
      if (!currencyBreakdown[currency]) {
        currencyBreakdown[currency] = {
          currency,
          invoiceCount: 0,
          invoiceAmount: 0,
          gstCollected: 0,
          expenseCount: 0,
          expenseAmount: 0,
          taxOnExpenses: 0,
          pendingPayments: 0,
          overdueCount: 0,
        };
      }
      currencyBreakdown[currency].invoiceCount++;
      currencyBreakdown[currency].invoiceAmount += inv.totalAmount;
      currencyBreakdown[currency].gstCollected += inv.gstAmount;
      if (inv.status === 'pending' || inv.status === 'overdue') {
        currencyBreakdown[currency].pendingPayments += inv.totalAmount;
      }
      if (inv.status === 'overdue') {
        currencyBreakdown[currency].overdueCount++;
      }
    });
    
    // Log currency breakdown after processing
    console.log(`[Monthly Report] Currency breakdown calculated:`, Object.keys(currencyBreakdown));
    Object.keys(currencyBreakdown).forEach(currency => {
      console.log(`[Monthly Report] ${currency}: ${currencyBreakdown[currency].invoiceCount} invoices, ${currencyBreakdown[currency].invoiceAmount} total`);
    });

    // Add expenses to currency breakdown (expenses use user's default currency)
    expenses.forEach((exp) => {
      const currency = userCurrency || 'INR';
      if (!currencyBreakdown[currency]) {
        currencyBreakdown[currency] = {
          currency,
          invoiceCount: 0,
          invoiceAmount: 0,
          gstCollected: 0,
          expenseCount: 0,
          expenseAmount: 0,
          taxOnExpenses: 0,
          pendingPayments: 0,
          overdueCount: 0,
        };
      }
      currencyBreakdown[currency].expenseCount++;
      currencyBreakdown[currency].expenseAmount += exp.totalAmount;
      currencyBreakdown[currency].taxOnExpenses += exp.taxAmount;
    });

    // Calculate overall totals (for backward compatibility)
    const totalInvoices = invoices.length;
    const totalInvoiceAmount = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalExpenses = expenses.length;
    const totalExpenseAmount = expenses.reduce((sum, exp) => sum + exp.totalAmount, 0);

    // Calculate GST collected (for backward compatibility - note: mixing currencies)
    const gstCollected = invoicesResult.rows.reduce((sum, row) => {
      const subtotal = parseFloat(row.subTotalAmount || 0);
      const total = parseFloat(row.totalAmount || 0);
      return sum + (total - subtotal);
    }, 0);

    // Calculate tax on expenses (for backward compatibility)
    const taxOnExpenses = expensesResult.rows.reduce((sum, row) => {
      const rate = parseFloat(row.taxPercentage || 0);
      if (!rate || rate <= 0) return sum;
      const subtotal = parseFloat(row.subTotalAmount || 0);
      const total = parseFloat(row.totalAmount || 0);
      const tax = total - subtotal;
      return sum + (tax > 0 ? tax : 0);
    }, 0);

    const netTax = gstCollected - taxOnExpenses;

    // Calculate pending payments (pending + overdue)
    const pendingPayments = invoices
      .filter((inv) => inv.status === 'pending' || inv.status === 'overdue')
      .reduce((sum, inv) => sum + inv.totalAmount, 0);

    const overdueInvoices = invoices.filter((inv) => inv.status === 'overdue').length;

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // Always return currency breakdown, even if empty or single currency
    const currencyBreakdownArray = Object.values(currencyBreakdown);
    console.log(`[Monthly Report] Returning currency breakdown with ${currencyBreakdownArray.length} currencies`);
    
    return {
      userId,
      userFullName: user.fullName,
      userEmail: user.email,
      userGSTIN: user.gstin || null,
      userPAN: user.pan || null,
      userLogo: user.logo || null,
      userCountry: user.country || null,
      userCurrency: userCurrency,
      month: monthNames[month - 1],
      monthNumber: month,
      year,
      startDate,
      endDate,
      totalInvoices,
      totalInvoiceAmount,
      totalExpenses,
      totalExpenseAmount,
      gstCollected,
      taxOnExpenses,
      netTax,
      pendingPayments,
      overdueInvoices,
      invoices,
      expenses,
      currencyBreakdown: currencyBreakdownArray.length > 0 ? currencyBreakdownArray : undefined,
    };
  } finally {
    client.release();
  }
};

/**
 * Generate PDF report
 */
export const generatePdfReport = (reportData: MonthlyReportData): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const MARGIN = 50;
    const MIN_PADDING = 2; // Minimum padding from borders
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
    const buffers: Buffer[] = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      resolve(Buffer.concat(buffers));
    });
    doc.on('error', reject);

    // Dynamic spacing calculations based on page dimensions
    const getPageDimensions = () => {
      if (!doc.page) return { width: 595.28, height: 841.89 }; // A4 default in points
      return {
        width: doc.page.width,
        height: doc.page.height,
      };
    };

    const getAvailableWidth = () => {
      const { width } = getPageDimensions();
      return width - (MARGIN * 2);
    };

    // Helper function to format currency based on user's currency
    const formatCurrency = (amount: number): string => {
      const currency = reportData.userCurrency || 'INR';
      const currencyMap: Record<string, { locale: string; symbol: string }> = {
        'INR': { locale: 'en-IN', symbol: '₹' },
        'USD': { locale: 'en-US', symbol: '$' },
        'EUR': { locale: 'en-EU', symbol: '€' },
        'GBP': { locale: 'en-GB', symbol: '£' },
        'JPY': { locale: 'ja-JP', symbol: '¥' },
        'CNY': { locale: 'zh-CN', symbol: '¥' },
        'AUD': { locale: 'en-AU', symbol: 'A$' },
        'CAD': { locale: 'en-CA', symbol: 'C$' },
        'SGD': { locale: 'en-SG', symbol: 'S$' },
        'AED': { locale: 'ar-AE', symbol: 'د.إ' },
      };
      
      const currencyInfo = currencyMap[currency] || currencyMap['INR'];
      
      try {
        const formatted = new Intl.NumberFormat(currencyInfo.locale, {
          style: 'currency',
          currency: currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(amount);
        return formatted;
      } catch {
        // Fallback if Intl.NumberFormat fails
        const formatted = new Intl.NumberFormat(currencyInfo.locale, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(amount);
        return `${currencyInfo.symbol}${formatted}`;
      }
    };

    // Helper function to format date
    const formatDate = (date: Date): string => {
      return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    };

    // Helper function to format date range
    const formatDateRange = (startDate: Date, endDate: Date): string => {
      const start = formatDate(startDate);
      const end = formatDate(endDate);
      return `${start} to ${end}`;
    };

    // Helper function to draw horizontal line
    const drawHLine = (x: number, y: number, width: number) => {
      doc.moveTo(x, y).lineTo(x + width, y).stroke();
    };

    // Helper function to draw vertical line
    const drawVLine = (x: number, y: number, height: number) => {
      doc.moveTo(x, y).lineTo(x, y + height).stroke();
    };

    // Track pages as we create them
    let pageCount = 1;

    // Helper function to add footer to current page (only website URL)
    const addFooterToCurrentPage = () => {
      if (doc.page) {
        const savedY = doc.y;
        const { width, height } = getPageDimensions();
        doc.fontSize(8).fillColor('#000000');
        doc.text(
          'www.mudhro.com',
          MARGIN,
          height - 10,
          { align: 'center', width: width - (MARGIN * 2) }
        );
        doc.fillColor('#000000');
        doc.y = savedY; // Restore Y position
      }
    };



    // ========================================
    // REPORT HEADER SECTION
    // ========================================
    const headerY = MARGIN;
    const { width: pageWidth } = getPageDimensions();
    
    // Dynamic header spacing
    const headerLineHeight = 15; // Base line height for header elements
    const headerSpacing = headerLineHeight + 5; // Spacing between header lines
    
    // Company/Brand name (top left)
    doc.fontSize(24).font('Helvetica-Bold').fillColor('#000000');
    doc.text('MUDHRO', MARGIN, headerY);
    doc.fontSize(12).font('Helvetica').fillColor('#000000');
    doc.text('Calm Finance for Freelancers', MARGIN, headerY + headerSpacing);
    
    // Website URL
    doc.fontSize(10).fillColor('#000000');
    doc.text('www.mudhro.com', MARGIN, headerY + (headerSpacing * 2));
    doc.fillColor('#000000');

    // Report Title (centered)
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#000000');
    doc.text('MONTHLY SUMMARY REPORT', 0, headerY + headerSpacing, { align: 'center', width: pageWidth });
    
    // Month and Year (centered)
    doc.fontSize(14).font('Helvetica');
    doc.text(`${reportData.month.toUpperCase()} ${reportData.year}`, 0, headerY + (headerSpacing * 2), { align: 'center', width: pageWidth });
    
    // Report period
    doc.fontSize(10).fillColor('#000000');
    doc.text(`Period: ${formatDateRange(reportData.startDate, reportData.endDate)}`, 0, headerY + (headerSpacing * 3), { align: 'center', width: pageWidth });
    doc.fillColor('#000000');

    // Freelancer Information (right side) - dynamic positioning
    const rightX = pageWidth - MARGIN - 150; // 150px width for right column
    doc.fontSize(10).fillColor('#000000');
    doc.text(`Prepared for:`, rightX, headerY);
    doc.font('Helvetica-Bold').fillColor('#000000');
    doc.text(reportData.userFullName, rightX, headerY + headerLineHeight);
    doc.font('Helvetica').fillColor('#000000');
    
    if (reportData.userPAN) {
      doc.fillColor('#000000');
      doc.text(`PAN: ${reportData.userPAN}`, rightX, headerY + (headerLineHeight * 2));
    }
    if (reportData.userGSTIN) {
      doc.fillColor('#000000');
      doc.text(`GSTIN: ${reportData.userGSTIN}`, rightX, headerY + (headerLineHeight * 3));
    }

    // Statement
    doc.fontSize(9).fillColor('#000000');
    doc.text('Report Generated by Mudhro', 0, headerY + (headerSpacing * 4), { align: 'center', width: pageWidth });
    doc.fillColor('#000000');

    // Dynamic header height based on content
    const headerHeight = headerY + (headerSpacing * 5) + 10;
    doc.y = headerHeight;

    // ========================================
    // 1. INCOME SUMMARY
    // ========================================
    // Dynamic section spacing - improved for better fit
    const sectionSpacing = 15; // Space between sections (increased from 10)
    const subsectionSpacing = 10; // Space between subsection title and content (increased from 8)
    const rowSpacing = 18; // Dynamic row height based on font size (reduced from 20 for better fit)
    const headerRowHeight = 22; // Header row height (reduced from 25 for better fit)
    
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000');
    doc.text('1. INCOME SUMMARY', MARGIN, doc.y);
    doc.font('Helvetica').fillColor('#000000');
    doc.y += doc.heightOfString('1. INCOME SUMMARY', { width: getAvailableWidth() }) + subsectionSpacing;

    console.log(`[PDF Generation] Invoices count: ${reportData.invoices.length}`);
    console.log(`[PDF Generation] Expenses count: ${reportData.expenses.length}`);
    
    if (reportData.invoices && reportData.invoices.length > 0) {
      const incomeTableY = doc.y;
      const availableWidth = getAvailableWidth();
      const incomeTableWidth = availableWidth;
      
      // Dynamic column widths based on available width
      // Proportional widths for: Date(12%), Client(18%), Invoice#(20%), Amount(15%), GST%(10%), GST Amt(12%), Status(13%)
      const colWidthRatios = [0.12, 0.18, 0.20, 0.15, 0.10, 0.12, 0.13];
      const colWidths = colWidthRatios.map(ratio => Math.floor(availableWidth * ratio));

      // Table Header
      doc.rect(MARGIN, incomeTableY, incomeTableWidth, headerRowHeight).fillAndStroke('#f0f0f0', '#000000');
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000');
      
      let xPos = MARGIN;
      const headerTextY = incomeTableY + ((headerRowHeight - 9) / 2); // Vertically center text
      doc.text('Date Range', xPos + MIN_PADDING, headerTextY);
      xPos += colWidths[0];
      drawVLine(xPos, incomeTableY, headerRowHeight);
      doc.text('Client', xPos + MIN_PADDING, headerTextY);
      xPos += colWidths[1];
      drawVLine(xPos, incomeTableY, headerRowHeight);
      doc.text('Invoice #', xPos + MIN_PADDING, headerTextY);
      xPos += colWidths[2];
      drawVLine(xPos, incomeTableY, headerRowHeight);
      doc.text('Amount', xPos + MIN_PADDING, headerTextY, { align: 'right', width: colWidths[3] - (MIN_PADDING * 2) });
      xPos += colWidths[3];
      drawVLine(xPos, incomeTableY, headerRowHeight);
      doc.text('GST %', xPos + MIN_PADDING, headerTextY, { align: 'center', width: colWidths[4] - (MIN_PADDING * 2) });
      xPos += colWidths[4];
      drawVLine(xPos, incomeTableY, headerRowHeight);
      doc.text('GST Amt', xPos + MIN_PADDING, headerTextY, { align: 'right', width: colWidths[5] - (MIN_PADDING * 2) });
      xPos += colWidths[5];
      drawVLine(xPos, incomeTableY, headerRowHeight);
      doc.text('Status', xPos + MIN_PADDING, headerTextY, { align: 'center', width: colWidths[6] - (MIN_PADDING * 2) });

      let tableY = incomeTableY + headerRowHeight;
      doc.font('Helvetica').fontSize(8).fillColor('#000000');

        reportData.invoices.forEach((invoice) => {
          const { height: pageHeight } = getPageDimensions();
          const maxY = pageHeight - MARGIN - headerRowHeight - 20; // Reserve space for footer and totals
          
          if (tableY > maxY) {
            // Add footer before new page
            if (doc.page) {
              addFooterToCurrentPage();
            }
            pageCount++;
            doc.addPage();
            tableY = MARGIN;
        }

        // Dynamic row height based on content
        const cellPadding = MIN_PADDING;
        const textY = tableY + cellPadding + ((rowSpacing - 8) / 2); // Vertically center 8pt text in row
        
        doc.rect(MARGIN, tableY, incomeTableWidth, rowSpacing).stroke();
        xPos = MARGIN;
        
        // Date Range
        doc.fillColor('#000000');
        const dateRange = formatDate(invoice.invoiceDate);
        doc.text(dateRange, xPos + MIN_PADDING, textY, { width: colWidths[0] - (MIN_PADDING * 2) });
        xPos += colWidths[0];
        drawVLine(xPos, tableY, rowSpacing);
        
        // Client Name
        doc.fillColor('#000000');
        const clientDisplay = invoice.clientOrganization || invoice.clientName;
        doc.text(clientDisplay.substring(0, 20), xPos + MIN_PADDING, textY, { width: colWidths[1] - (MIN_PADDING * 2) });
        xPos += colWidths[1];
        drawVLine(xPos, tableY, rowSpacing);
        
        // Invoice #
        doc.fillColor('#000000');
        doc.text(invoice.invoiceNumber.substring(0, 15), xPos + MIN_PADDING, textY, { width: colWidths[2] - (MIN_PADDING * 2) });
        xPos += colWidths[2];
        drawVLine(xPos, tableY, rowSpacing);
        
        // Invoice Amount
        doc.fillColor('#000000');
        doc.text(formatCurrency(invoice.totalAmount), xPos + MIN_PADDING, textY, { align: 'right', width: colWidths[3] - (MIN_PADDING * 2) });
        xPos += colWidths[3];
        drawVLine(xPos, tableY, rowSpacing);
        
        // GST %
        doc.fillColor('#000000');
        doc.text(invoice.gst > 0 ? `${invoice.gst}%` : '—', xPos + MIN_PADDING, textY, { align: 'center', width: colWidths[4] - (MIN_PADDING * 2) });
        xPos += colWidths[4];
        drawVLine(xPos, tableY, rowSpacing);
        
        // GST Amount
        doc.fillColor('#000000');
        doc.text(formatCurrency(invoice.gstAmount), xPos + MIN_PADDING, textY, { align: 'right', width: colWidths[5] - (MIN_PADDING * 2) });
        xPos += colWidths[5];
        drawVLine(xPos, tableY, rowSpacing);
        
        // Status
        doc.fillColor('#000000');
        doc.text(invoice.status.toUpperCase(), xPos + MIN_PADDING, textY, { align: 'center', width: colWidths[6] - (MIN_PADDING * 2) });
        doc.fillColor('#000000');
        
        tableY += rowSpacing;
      });

      // Totals Row
      drawHLine(MARGIN, tableY, incomeTableWidth);
      doc.rect(MARGIN, tableY, incomeTableWidth, rowSpacing).fillAndStroke('#f9f9f9', '#000000');
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000');
      
      xPos = MARGIN;
      const totalsTextY = tableY + MIN_PADDING + ((rowSpacing - 9) / 2);
      doc.fillColor('#000000');
      doc.text('TOTALS', xPos + MIN_PADDING, totalsTextY);
      xPos += colWidths[0] + colWidths[1] + colWidths[2];
      drawVLine(xPos, tableY, rowSpacing);
      doc.fillColor('#000000');
      doc.text(formatCurrency(reportData.totalInvoiceAmount), xPos + MIN_PADDING, totalsTextY, { align: 'right', width: colWidths[3] - (MIN_PADDING * 2) });
      xPos += colWidths[3];
      drawVLine(xPos, tableY, rowSpacing);
      doc.fillColor('#000000');
      doc.text('—', xPos + MIN_PADDING, totalsTextY, { align: 'center', width: colWidths[4] - (MIN_PADDING * 2) });
      xPos += colWidths[4];
      drawVLine(xPos, tableY, rowSpacing);
      doc.fillColor('#000000');
      doc.text(formatCurrency(reportData.gstCollected), xPos + MIN_PADDING, totalsTextY, { align: 'right', width: colWidths[5] - (MIN_PADDING * 2) });
      xPos += colWidths[5];
      drawVLine(xPos, tableY, rowSpacing);
      doc.fillColor('#000000');
      doc.text(formatCurrency(reportData.totalInvoiceAmount - reportData.gstCollected), xPos + MIN_PADDING, totalsTextY, { align: 'right', width: colWidths[6] - (MIN_PADDING * 2) });
      
      doc.y = tableY + rowSpacing + sectionSpacing;
      doc.font('Helvetica');
    } else {
      doc.fontSize(9).fillColor('#000000');
      doc.text('No income records for this period', MARGIN, doc.y);
      doc.fillColor('#000000');
      doc.y += rowSpacing + sectionSpacing;
    }

    // ========================================
    // 2. EXPENSE SUMMARY
    // ========================================
    // Dynamic page break checking
    const { height: pageHeight } = getPageDimensions();
    const maxYForSection = pageHeight - MARGIN - (rowSpacing * 2) - headerRowHeight - 20;
    
    // Only add new page if we're close to the bottom AND we have expenses to show
    if (doc.y > maxYForSection && reportData.expenses && reportData.expenses.length > 0) {
      // Add footer before new page
      if (doc.page) {
        addFooterToCurrentPage();
      }
      pageCount++;
      doc.addPage();
      doc.y = MARGIN;
    } else if (doc.y > maxYForSection) {
      // If we're too close to bottom even without expenses, add page
      if (doc.page) {
        addFooterToCurrentPage();
      }
      pageCount++;
      doc.addPage();
      doc.y = MARGIN;
    }

    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000');
    doc.text('2. EXPENSE SUMMARY', MARGIN, doc.y);
    doc.font('Helvetica').fillColor('#000000');
    doc.y += doc.heightOfString('2. EXPENSE SUMMARY', { width: getAvailableWidth() }) + subsectionSpacing;

    if (reportData.expenses && reportData.expenses.length > 0) {
      const expenseTableY = doc.y;
      const availableWidth = getAvailableWidth();
      const expenseTableWidth = availableWidth;

      // Dynamic column widths based on available width
      // Proportional widths for: Date(10%), Vendor(24%), Bill#(24%), Amount(14%), Tax%(10%), Tax Amt(18%)
      const expColWidthRatios = [0.10, 0.24, 0.24, 0.14, 0.10, 0.18];
      const expColWidths = expColWidthRatios.map(ratio => Math.floor(availableWidth * ratio));

      // Table Header
      doc.rect(MARGIN, expenseTableY, expenseTableWidth, headerRowHeight).fillAndStroke('#f0f0f0', '#000000');
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000');
      
      let xPos = MARGIN;
      const headerTextY = expenseTableY + ((headerRowHeight - 9) / 2);
      doc.text('Date', xPos + MIN_PADDING, headerTextY);
      xPos += expColWidths[0];
      drawVLine(xPos, expenseTableY, headerRowHeight);
      doc.text('Vendor', xPos + MIN_PADDING, headerTextY);
      xPos += expColWidths[1];
      drawVLine(xPos, expenseTableY, headerRowHeight);
      doc.text('Bill #', xPos + MIN_PADDING, headerTextY);
      xPos += expColWidths[2];
      drawVLine(xPos, expenseTableY, headerRowHeight);
      doc.text('Amount', xPos + MIN_PADDING, headerTextY, { align: 'right', width: expColWidths[3] - (MIN_PADDING * 2) });
      xPos += expColWidths[3];
      drawVLine(xPos, expenseTableY, headerRowHeight);
      doc.text('Tax %', xPos + MIN_PADDING, headerTextY, { align: 'center', width: expColWidths[4] - (MIN_PADDING * 2) });
      xPos += expColWidths[4];
      drawVLine(xPos, expenseTableY, headerRowHeight);
      doc.text('Tax Amt', xPos + MIN_PADDING, headerTextY, { align: 'right', width: expColWidths[5] - (MIN_PADDING * 2) });

      let tableY = expenseTableY + headerRowHeight;
      doc.font('Helvetica').fontSize(8).fillColor('#000000');

      reportData.expenses.forEach((expense) => {
        const maxY = pageHeight - MARGIN - headerRowHeight - 20;
        
        if (tableY > maxY) {
          // Add footer before new page
          if (doc.page) {
            addFooterToCurrentPage();
          }
          pageCount++;
          doc.addPage();
          tableY = MARGIN;
        }

        // Dynamic row height based on content
        const textY = tableY + MIN_PADDING + ((rowSpacing - 8) / 2);
        
        doc.rect(MARGIN, tableY, expenseTableWidth, rowSpacing).stroke();
        xPos = MARGIN;
        
        // Date
        doc.fillColor('#000000');
        doc.text(formatDate(expense.billDate), xPos + MIN_PADDING, textY, { width: expColWidths[0] - (MIN_PADDING * 2) });
        xPos += expColWidths[0];
        drawVLine(xPos, tableY, rowSpacing);
        
        // Vendor
        doc.fillColor('#000000');
        doc.text(expense.vendorName.substring(0, 25), xPos + MIN_PADDING, textY, { width: expColWidths[1] - (MIN_PADDING * 2) });
        xPos += expColWidths[1];
        drawVLine(xPos, tableY, rowSpacing);
        
        // Bill #
        doc.fillColor('#000000');
        doc.text(expense.billNumber.substring(0, 20), xPos + MIN_PADDING, textY, { width: expColWidths[2] - (MIN_PADDING * 2) });
        xPos += expColWidths[2];
        drawVLine(xPos, tableY, rowSpacing);
        
        // Amount
        doc.fillColor('#000000');
        doc.text(formatCurrency(expense.totalAmount), xPos + MIN_PADDING, textY, { align: 'right', width: expColWidths[3] - (MIN_PADDING * 2) });
        xPos += expColWidths[3];
        drawVLine(xPos, tableY, rowSpacing);
        
        // Tax %
        doc.fillColor('#000000');
        doc.text(expense.taxPercentage > 0 ? `${expense.taxPercentage.toFixed(2)}%` : '—', xPos + MIN_PADDING, textY, { align: 'center', width: expColWidths[4] - (MIN_PADDING * 2) });
        xPos += expColWidths[4];
        drawVLine(xPos, tableY, rowSpacing);
        
        // Tax Amount
        doc.fillColor('#000000');
        doc.text(formatCurrency(expense.taxAmount), xPos + MIN_PADDING, textY, { align: 'right', width: expColWidths[5] - (MIN_PADDING * 2) });
        
        tableY += rowSpacing;
      });

      // Totals Row
      drawHLine(MARGIN, tableY, expenseTableWidth);
      doc.rect(MARGIN, tableY, expenseTableWidth, rowSpacing).fillAndStroke('#f9f9f9', '#000000');
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000');
      
      xPos = MARGIN;
      const totalsTextY = tableY + MIN_PADDING + ((rowSpacing - 9) / 2);
      doc.fillColor('#000000');
      doc.text('TOTALS', xPos + MIN_PADDING, totalsTextY);
      xPos += expColWidths[0] + expColWidths[1] + expColWidths[2];
      drawVLine(xPos, tableY, rowSpacing);
      doc.fillColor('#000000');
      doc.text(formatCurrency(reportData.totalExpenseAmount), xPos + MIN_PADDING, totalsTextY, { align: 'right', width: expColWidths[3] - (MIN_PADDING * 2) });
      xPos += expColWidths[3];
      drawVLine(xPos, tableY, rowSpacing);
      doc.fillColor('#000000');
      doc.text('—', xPos + MIN_PADDING, totalsTextY, { align: 'center', width: expColWidths[4] - (MIN_PADDING * 2) });
      xPos += expColWidths[4];
      drawVLine(xPos, tableY, rowSpacing);
      doc.fillColor('#000000');
      doc.text(formatCurrency(reportData.taxOnExpenses), xPos + MIN_PADDING, totalsTextY, { align: 'right', width: expColWidths[5] - (MIN_PADDING * 2) });
      
      doc.y = tableY + rowSpacing + sectionSpacing;
      doc.font('Helvetica');
    } else {
      doc.fontSize(9).fillColor('#000000');
      doc.text('No expense records for this period', MARGIN, doc.y);
      doc.fillColor('#000000');
      doc.y += rowSpacing + sectionSpacing;
    }

    // ========================================
    // 3. TAX GST SUMMARY
    // ========================================
    // Dynamic page break - need space for tax table (5 rows * rowSpacing)
    const taxTableEstimatedHeight = (rowSpacing * 6);
    if (doc.y > (pageHeight - MARGIN - taxTableEstimatedHeight - 20)) {
      // Add footer before new page
      if (doc.page) {
        addFooterToCurrentPage();
      }
      pageCount++;
      doc.addPage();
      doc.y = MARGIN;
    }

    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000');
    doc.text('3. TAX GST SUMMARY', MARGIN, doc.y);
    doc.font('Helvetica').fillColor('#000000');
    doc.y += doc.heightOfString('3. TAX GST SUMMARY', { width: getAvailableWidth() }) + subsectionSpacing;

    const taxTableY = doc.y;
    const availableWidth = getAvailableWidth();
    const taxTableWidth = availableWidth;
    const taxRowHeight = rowSpacing;

    doc.rect(MARGIN, taxTableY, taxTableWidth, headerRowHeight).fillAndStroke('#f0f0f0', '#000000');
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000');

    const taxHeaderTextY = taxTableY + ((headerRowHeight - 10) / 2);
    doc.fillColor('#000000');
    doc.text('Description', MARGIN + MIN_PADDING, taxHeaderTextY);
    doc.fillColor('#000000');
    const amountColWidth = Math.floor(availableWidth * 0.35);
    const descColWidth = availableWidth - amountColWidth;
    doc.text('Amount', MARGIN + descColWidth + MIN_PADDING, taxHeaderTextY, { align: 'right', width: amountColWidth - (MIN_PADDING * 2) });
    drawHLine(MARGIN, taxTableY + headerRowHeight, taxTableWidth);

    let taxY = taxTableY + headerRowHeight;
    doc.font('Helvetica').fontSize(9).fillColor('#000000');

    const taxTextY = taxY + MIN_PADDING + ((taxRowHeight - 9) / 2);
    // GST Collected
    doc.rect(MARGIN, taxY, taxTableWidth, taxRowHeight).stroke();
    doc.fillColor('#000000');
    doc.text('GST Collected on Invoices', MARGIN + MIN_PADDING, taxTextY, { width: descColWidth - (MIN_PADDING * 2) });
    doc.fillColor('#000000');
    doc.text(formatCurrency(reportData.gstCollected), MARGIN + descColWidth + MIN_PADDING, taxTextY, { align: 'right', width: amountColWidth - (MIN_PADDING * 2) });
    taxY += taxRowHeight;

    // GST Paid on Expenses
    const taxTextY2 = taxY + MIN_PADDING + ((taxRowHeight - 9) / 2);
    doc.rect(MARGIN, taxY, taxTableWidth, taxRowHeight).stroke();
    doc.fillColor('#000000');
    doc.text('GST/Tax Paid on Expenses', MARGIN + MIN_PADDING, taxTextY2, { width: descColWidth - (MIN_PADDING * 2) });
    doc.fillColor('#000000');
    doc.text(formatCurrency(reportData.taxOnExpenses), MARGIN + descColWidth + MIN_PADDING, taxTextY2, { align: 'right', width: amountColWidth - (MIN_PADDING * 2) });
    taxY += taxRowHeight;

    // GST Payable
    const taxTextY3 = taxY + MIN_PADDING + ((taxRowHeight - 9) / 2);
    doc.rect(MARGIN, taxY, taxTableWidth, taxRowHeight).stroke();
    doc.fillColor('#000000').font('Helvetica-Bold');
    doc.text('Net GST Payable (Payable/Savings)', MARGIN + MIN_PADDING, taxTextY3, { width: descColWidth - (MIN_PADDING * 2) });
    doc.text(formatCurrency(Math.abs(reportData.netTax)), MARGIN + descColWidth + MIN_PADDING, taxTextY3, { align: 'right', width: amountColWidth - (MIN_PADDING * 2) });
    doc.fillColor('#000000').font('Helvetica');
    taxY += taxRowHeight;

    // TDS Deducted (placeholder - if needed in future)
    const taxTextY4 = taxY + MIN_PADDING + ((taxRowHeight - 9) / 2);
    doc.rect(MARGIN, taxY, taxTableWidth, taxRowHeight).stroke();
    doc.fillColor('#000000');
    doc.text('TDS Deducted by Clients', MARGIN + MIN_PADDING, taxTextY4, { width: descColWidth - (MIN_PADDING * 2) });
    doc.fillColor('#000000');
    doc.text(formatCurrency(0), MARGIN + descColWidth + MIN_PADDING, taxTextY4, { align: 'right', width: amountColWidth - (MIN_PADDING * 2) });
    taxY += taxRowHeight;

    // Net Tax Payable
    const taxTextY5 = taxY + MIN_PADDING + ((taxRowHeight - 10) / 2);
    doc.rect(MARGIN, taxY, taxTableWidth, taxRowHeight).fillAndStroke('#f9f9f9', '#000000');
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000');
    doc.text('Net Tax Payable after TDS', MARGIN + MIN_PADDING, taxTextY5, { width: descColWidth - (MIN_PADDING * 2) });
    const netAfterTDS = reportData.netTax - 0; // TDS would be deducted here
    doc.fillColor('#000000');
    doc.text(formatCurrency(Math.abs(netAfterTDS)), MARGIN + descColWidth + MIN_PADDING, taxTextY5, { align: 'right', width: amountColWidth - (MIN_PADDING * 2) });
    doc.fillColor('#000000');
    doc.font('Helvetica');

    doc.y = taxY + taxRowHeight + sectionSpacing;

    // ========================================
    // 4. PROFIT & LOSS OVERVIEW
    // ========================================
    // Dynamic page break - need space for profit table (3 rows * 30px)
    const profitTableEstimatedHeight = (30 * 3);
    if (doc.y > (pageHeight - MARGIN - profitTableEstimatedHeight - 20)) {
      // Add footer before new page
      if (doc.page) {
        addFooterToCurrentPage();
      }
      pageCount++;
      doc.addPage();
      doc.y = MARGIN;
    }

    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000');
    doc.text('4. PROFIT & LOSS OVERVIEW', MARGIN, doc.y);
    doc.font('Helvetica').fillColor('#000000');
    doc.y += doc.heightOfString('4. PROFIT & LOSS OVERVIEW', { width: getAvailableWidth() }) + subsectionSpacing;

    const profitTableY = doc.y;
    const availableWidth2 = getAvailableWidth();
    const profitTableWidth = availableWidth2;
    const profitRowHeight = 30;

    const profitDescWidth = Math.floor(availableWidth2 * 0.65);
    const profitAmountWidth = availableWidth2 - profitDescWidth;

    // Total Income
    const profitTextY1 = profitTableY + MIN_PADDING + ((profitRowHeight - 11) / 2);
    doc.rect(MARGIN, profitTableY, profitTableWidth, profitRowHeight).stroke();
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000');
    doc.text('Total Income for the Month', MARGIN + MIN_PADDING, profitTextY1, { width: profitDescWidth - (MIN_PADDING * 2) });
    doc.fillColor('#000000');
    doc.text(formatCurrency(reportData.totalInvoiceAmount), MARGIN + profitDescWidth + MIN_PADDING, profitTextY1, { align: 'right', width: profitAmountWidth - (MIN_PADDING * 2) });

    // Total Expenses
    const expenseY = profitTableY + profitRowHeight;
    const profitTextY2 = expenseY + MIN_PADDING + ((profitRowHeight - 11) / 2);
    doc.rect(MARGIN, expenseY, profitTableWidth, profitRowHeight).stroke();
    doc.fillColor('#000000');
    doc.text('Total Expenses', MARGIN + MIN_PADDING, profitTextY2, { width: profitDescWidth - (MIN_PADDING * 2) });
    doc.fillColor('#000000');
    doc.text(formatCurrency(reportData.totalExpenseAmount), MARGIN + profitDescWidth + MIN_PADDING, profitTextY2, { align: 'right', width: profitAmountWidth - (MIN_PADDING * 2) });

    // Net Profit
    const netProfitY = expenseY + profitRowHeight;
    const netProfit = reportData.totalInvoiceAmount - reportData.totalExpenseAmount;
    const profitTextY3 = netProfitY + MIN_PADDING + ((profitRowHeight - 12) / 2);
    doc.rect(MARGIN, netProfitY, profitTableWidth, profitRowHeight).fillAndStroke('#f0f9ff', '#000000');
    doc.fontSize(12).fillColor('#000000');
    doc.text('Net Profit before Income Tax', MARGIN + MIN_PADDING, profitTextY3, { width: profitDescWidth - (MIN_PADDING * 2) });
    doc.fillColor('#000000');
    doc.text(formatCurrency(netProfit), MARGIN + profitDescWidth + MIN_PADDING, profitTextY3, { align: 'right', width: profitAmountWidth - (MIN_PADDING * 2) });
    doc.fillColor('#000000');
    doc.font('Helvetica');

    doc.y = netProfitY + profitRowHeight + sectionSpacing;

    // ========================================
    // 5. COMPLIANCE DETAILS
    // ========================================
    // Dynamic page break - need space for compliance table (3 rows * rowSpacing)
    const complianceTableEstimatedHeight = (rowSpacing * 3);
    if (doc.y > (pageHeight - MARGIN - complianceTableEstimatedHeight - 20)) {
      // Add footer before new page
      if (doc.page) {
        addFooterToCurrentPage();
      }
      pageCount++;
      doc.addPage();
      doc.y = MARGIN;
    }

    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000');
    doc.text('5. COMPLIANCE DETAILS', MARGIN, doc.y);
    doc.font('Helvetica').fillColor('#000000');
    doc.y += doc.heightOfString('5. COMPLIANCE DETAILS', { width: getAvailableWidth() }) + subsectionSpacing;

    const complianceY = doc.y;
    const availableWidth3 = getAvailableWidth();
    const complianceTableWidth = availableWidth3;
    const complianceRowHeight = rowSpacing;

    const complianceDescWidth = Math.floor(availableWidth3 * 0.65);
    const complianceValueWidth = availableWidth3 - complianceDescWidth;

    const complianceTextY1 = complianceY + MIN_PADDING + ((complianceRowHeight - 10) / 2);
    doc.rect(MARGIN, complianceY, complianceTableWidth, complianceRowHeight).stroke();
    doc.fontSize(10).fillColor('#000000');
    doc.text('GST Filing Frequency', MARGIN + MIN_PADDING, complianceTextY1, { width: complianceDescWidth - (MIN_PADDING * 2) });
    doc.fillColor('#000000');
    doc.text(reportData.userGSTIN ? 'Monthly' : 'N/A', MARGIN + complianceDescWidth + MIN_PADDING, complianceTextY1, { width: complianceValueWidth - (MIN_PADDING * 2) });

    const nextDueY = complianceY + complianceRowHeight;
    const complianceTextY2 = nextDueY + MIN_PADDING + ((complianceRowHeight - 10) / 2);
    doc.rect(MARGIN, nextDueY, complianceTableWidth, complianceRowHeight).stroke();
    doc.fillColor('#000000');
    doc.text('Next Due Date for GST Filing', MARGIN + MIN_PADDING, complianceTextY2, { width: complianceDescWidth - (MIN_PADDING * 2) });
    
    // Calculate next GST filing date (typically 13th of next month)
    const nextMonth = reportData.monthNumber === 12 ? 1 : reportData.monthNumber + 1;
    const nextYear = reportData.monthNumber === 12 ? reportData.year + 1 : reportData.year;
    const nextFilingDate = new Date(nextYear, nextMonth - 1, 13);
    doc.fillColor('#000000');
    doc.text(reportData.userGSTIN ? formatDate(nextFilingDate) : 'N/A', MARGIN + complianceDescWidth + MIN_PADDING, complianceTextY2, { width: complianceValueWidth - (MIN_PADDING * 2) });

    const tdsY = nextDueY + complianceRowHeight;
    const complianceTextY3 = tdsY + MIN_PADDING + ((complianceRowHeight - 10) / 2);
    doc.rect(MARGIN, tdsY, complianceTableWidth, complianceRowHeight).stroke();
    doc.fillColor('#000000');
    doc.text('TDS Summary', MARGIN + MIN_PADDING, complianceTextY3, { width: complianceDescWidth - (MIN_PADDING * 2) });
    doc.fillColor('#000000');
    doc.text('Auto-linking with Form 26AS (when available)', MARGIN + complianceDescWidth + MIN_PADDING, complianceTextY3, { width: complianceValueWidth - (MIN_PADDING * 2) });

    doc.y = tdsY + complianceRowHeight + sectionSpacing;

    // ========================================
    // 6. NOTES SECTION
    // ========================================
    // Only add page if we're too close to bottom (need space for notes box ~100px)
    // Improved calculation for better fit
    // Reuse pageHeight from earlier in the function (declared at line 730)
    const notesBoxEstimatedHeight = 100; // Estimated height for notes box
    if (doc.y > (pageHeight - MARGIN - notesBoxEstimatedHeight - 20)) {
      // Add footer before new page
      if (doc.page) {
        addFooterToCurrentPage();
      }
      pageCount++;
      doc.addPage();
      doc.y = MARGIN;
    }

    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000');
    doc.text('6. NOTES', 50, doc.y);
    doc.font('Helvetica').fillColor('#000000');
    doc.moveDown(0.8);

    const notesBoxY = doc.y;
    const availableWidth4 = getAvailableWidth();
    const notesBoxWidth = availableWidth4;
    
    // Calculate dynamic box height based on content
    const lineSpacing = 12;
    const notesText = [
      '• This report is auto-generated using uploaded invoice and expense data.',
      '• All calculations are based on the data entered in the system.',
      '• For any discrepancies, please verify the source documents.',
      '',
      'Thank you for using Mudhro - Calm Finance for Freelancers'
    ];
    const notesBoxHeight = (notesText.length * lineSpacing) + (MIN_PADDING * 2);

    doc.rect(MARGIN, notesBoxY, notesBoxWidth, notesBoxHeight).stroke();
    doc.fontSize(9).fillColor('#000000');
    
    let noteY = notesBoxY + MIN_PADDING;
    notesText.forEach((line) => {
      doc.text(line, MARGIN + MIN_PADDING, noteY, { width: notesBoxWidth - (MIN_PADDING * 2) });
      noteY += lineSpacing;
    });

    doc.fillColor('#000000');

    // Add footer to the last page before ending
    if (doc.page) {
      addFooterToCurrentPage();
    }

    doc.end();
  });
};

/**
 * Generate and send monthly reports for all users
 */
export const generateAndSendMonthlyReports = async (): Promise<void> => {
  const now = new Date();
  const month = now.getMonth() + 1; // Current month (1-12)
  const year = now.getFullYear();

  // Get previous month (since we run at end of month, report is for previous month)
  let reportMonth = month - 1;
  let reportYear = year;
  if (reportMonth === 0) {
    reportMonth = 12;
    reportYear = year - 1;
  }

  console.log(`[Monthly Report] Generating reports for ${reportMonth}/${reportYear}`);

  const users = await getAllActiveUsers();
  console.log(`[Monthly Report] Found ${users.length} active users`);

  const reportsDir = path.join(process.cwd(), 'MonthlyReports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const user of users) {
    try {
      console.log(`[Monthly Report] Processing user: ${user.email}`);

      // Get report data
      const reportData = await getMonthlyReportData(user.id, reportMonth, reportYear);

      // Generate PDF
      const pdfBuffer = await generatePdfReport(reportData);

      // Save PDF to file with timestamp
      const now = new Date();
      const timestamp = now.toISOString()
        .replace(/T/, '_')
        .replace(/:/g, '-')
        .replace(/\..+/, ''); // Format: 2025-11-17_05-50-02
      const fileName = `Monthly_Report_${reportData.month}_${reportYear}_${user.id}_${timestamp}.pdf`;
      const filePath = path.join(reportsDir, fileName);
      fs.writeFileSync(filePath, pdfBuffer);
      
      console.log(`[Monthly Report] PDF saved: ${fileName}`);

      // Send email
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];

      const emailSubject = `Your ${monthNames[reportMonth - 1]} ${reportYear} Monthly Summary Report`;
      
      // Build invoice details list
      let invoiceDetailsHtml = '';
      if (reportData.invoices && reportData.invoices.length > 0) {
        invoiceDetailsHtml = '<h3>Invoice Details:</h3><ul>';
        reportData.invoices.forEach((inv) => {
          invoiceDetailsHtml += `<li>${inv.invoiceNumber} - ${inv.clientName || inv.clientOrganization || 'N/A'} - ₹${inv.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${inv.status})</li>`;
        });
        invoiceDetailsHtml += '</ul>';
      } else {
        invoiceDetailsHtml = '<p><em>No invoices for this period.</em></p>';
      }

      // Build expense details list
      let expenseDetailsHtml = '';
      if (reportData.expenses && reportData.expenses.length > 0) {
        expenseDetailsHtml = '<h3>Expense Details:</h3><ul>';
        reportData.expenses.forEach((exp) => {
          expenseDetailsHtml += `<li>${exp.billNumber} - ${exp.vendorName} - ₹${exp.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</li>`;
        });
        expenseDetailsHtml += '</ul>';
      } else {
        expenseDetailsHtml = '<p><em>No expenses for this period.</em></p>';
      }

      const emailHtml = `
        <p>Hi ${user.fullName},</p>
        <p>Please find attached your monthly summary report for <strong>${monthNames[reportMonth - 1]} ${reportYear}</strong>.</p>
        <p><strong>Summary:</strong></p>
        <ul>
          <li>Total Invoices: ${reportData.totalInvoices}</li>
          <li>Total Invoice Amount: ₹${reportData.totalInvoiceAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</li>
          <li>Total Expenses: ${reportData.totalExpenses}</li>
          <li>Total Expense Amount: ₹${reportData.totalExpenseAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</li>
          <li>GST Collected: ₹${reportData.gstCollected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</li>
          <li>Tax on Expenses: ₹${reportData.taxOnExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</li>
          <li>Net Tax: ₹${Math.abs(reportData.netTax).toLocaleString('en-IN', { minimumFractionDigits: 2 })} ${reportData.netTax >= 0 ? '(Payable)' : '(Savings)'}</li>
        </ul>
        ${invoiceDetailsHtml}
        ${expenseDetailsHtml}
        <p>Thank you for using Mudhro!</p>
        <p>Best regards,<br/>Mudhro Team</p>
      `;

      await sendMail({
        to: user.email,
        subject: emailSubject,
        html: emailHtml,
        attachments: [
          {
            filename: fileName,
            path: filePath,
          },
        ],
      });

      console.log(`[Monthly Report] Successfully sent report to ${user.email}`);
      results.success++;
    } catch (error: any) {
      console.error(`[Monthly Report] Failed to process user ${user.email}:`, error);
      results.failed++;
      results.errors.push(`${user.email}: ${error.message || 'Unknown error'}`);
    }
  }

  console.log(`[Monthly Report] Completed. Success: ${results.success}, Failed: ${results.failed}`);
  if (results.errors.length > 0) {
    console.error('[Monthly Report] Errors:', results.errors);
  }
};
