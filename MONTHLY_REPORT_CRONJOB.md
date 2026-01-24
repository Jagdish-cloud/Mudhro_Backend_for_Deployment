# Monthly Report Cronjob Setup

This document explains how to set up a cronjob to automatically generate and send monthly reports to all registered users at the end of each month.

## Overview

The monthly report service generates PDF reports containing:
- Summary statistics (total invoices, expenses, tax calculations)
- List of all invoices for the month
- List of all expenses for the month
- Tax payable/savings calculations
- Pending payments and overdue invoices

Reports are automatically emailed to all active users with valid email addresses.

## API Endpoints

### Production Endpoint (for cronjob)
```
POST /api/monthly-reports/generate
```

### Test Endpoint (for manual testing)
```
GET /api/monthly-reports/test
```

## Environment Variables

Add the following to your `.env` file:

```env
# Required: Gmail credentials for sending emails
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-app-password
```

## Setting Up the Cronjob

### Option 1: Using Linux/Unix Cron

1. Open your crontab:
   ```bash
   crontab -e
   ```

2. Add the following line to run at 11:59 PM on the last day of each month:
   ```cron
   59 23 28-31 * * [ $(date -d tomorrow +\%d) -eq 1 ] && curl -X POST http://localhost:3000/api/monthly-reports/generate -H "Content-Type: application/json"
   ```

   Or use a simpler approach that runs on the 1st of each month at 12:00 AM (for the previous month):
   ```cron
   0 0 1 * * curl -X POST http://localhost:3000/api/monthly-reports/generate -H "Content-Type: application/json"
   ```

### Option 2: Using Node-Cron (Recommended for Node.js environments)

1. Install node-cron:
   ```bash
   npm install node-cron
   ```

2. Create a cronjob script (`backend/src/scripts/monthlyReportCron.ts`):
   ```typescript
   import cron from 'node-cron';
   import { generateAndSendMonthlyReports } from '../services/monthlyReportService';

   // Run on the 1st of each month at 12:00 AM
   cron.schedule('0 0 1 * *', async () => {
     console.log('[Cronjob] Starting monthly report generation...');
     try {
       await generateAndSendMonthlyReports();
       console.log('[Cronjob] Monthly reports generated successfully');
     } catch (error) {
       console.error('[Cronjob] Error generating monthly reports:', error);
     }
   });

   console.log('Monthly report cronjob scheduled');
   ```

3. Import and start the cronjob in your main server file (`backend/src/index.ts`):
   ```typescript
   import './scripts/monthlyReportCron';
   ```

### Option 3: Using External Cron Services

You can use services like:
- **cron-job.org**: Free web-based cron service
- **EasyCron**: Reliable cron service
- **GitHub Actions**: Schedule workflows
- **AWS EventBridge**: For cloud deployments

Configure them to call:
```
POST http://your-domain.com/api/monthly-reports/generate
```

## Testing

### Manual Test

1. Start your backend server:
   ```bash
   npm run dev
   ```

2. Test the endpoint:
   ```bash
   curl -X GET "http://localhost:3000/api/monthly-reports/test"
   ```

   Or using a tool like Postman:
   - Method: GET
   - URL: `http://localhost:3000/api/monthly-reports/test`

### Verify Reports

1. Check the `MonthlyReports` directory in your backend root for generated PDFs
2. Check your email inbox for the report email
3. Check server logs for any errors

## Report Generation Details

- **Report Period**: The report is generated for the **previous month** (e.g., if run on Feb 1st, it generates a report for January)
- **User Filtering**: Only active users with valid email addresses receive reports
- **PDF Storage**: PDFs are saved in `backend/MonthlyReports/` directory
- **Email Attachments**: Each user receives their personalized PDF report via email

## Troubleshooting

### Reports Not Being Sent

1. **Check Email Configuration**: Ensure `GMAIL_USER` and `GMAIL_APP_PASSWORD` are set correctly
2. **Check User Emails**: Verify users have valid email addresses in the database
3. **Check Logs**: Review server logs for error messages
4. **Check Database**: Ensure invoices and expenses exist for the report period

### PDF Generation Errors

1. **Check Dependencies**: Ensure `pdfkit` is installed (`npm install`)
2. **Check Permissions**: Ensure the `MonthlyReports` directory is writable
3. **Check Logs**: Review error messages in server logs

### Cronjob Not Running

1. **Verify Cron Syntax**: Use a cron syntax validator
2. **Check Server Timezone**: Ensure server timezone is correct
3. **Test Manually**: Use the test endpoint to verify functionality
4. **Check Logs**: Review cron logs for execution records

## Security Considerations

1. **HTTPS**: Use HTTPS in production to secure API calls
2. **Rate Limiting**: Consider adding rate limiting to prevent abuse
3. **IP Whitelisting**: Optionally restrict the endpoint to specific IP addresses or use a reverse proxy with authentication
4. **Network Security**: Ensure the endpoint is only accessible from trusted networks or protected by a firewall

## Monthly Report Content

Each report includes:

1. **Summary Section**:
   - Total Invoices and Amount
   - Total Expenses and Amount
   - GST Collected
   - Tax on Expenses
   - Net Tax (Payable/Savings)
   - Pending Payments
   - Overdue Invoices Count

2. **Invoices Table**:
   - Invoice Number
   - Invoice Date
   - Due Date
   - Client Name
   - Amount
   - Status (Paid/Pending/Overdue)

3. **Expenses Table**:
   - Bill Number
   - Bill Date
   - Vendor Name
   - Amount

4. **Footer**: Page numbers and generation date

## Notes

- Reports are generated for the **previous month** when the cronjob runs
- The service automatically handles month-end edge cases (e.g., January reports when running in February)
- Failed reports for individual users are logged but don't stop the process for other users
- PDFs are stored locally and can be archived or deleted as needed

