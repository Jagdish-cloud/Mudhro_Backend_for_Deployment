import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import pool from './config/database';
import { getSecurityConfig, isProduction } from './config/security';
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import masterClientRoutes from './routes/masterClient';
import projectRoutes from './routes/project';
import itemRoutes from './routes/item';
import invoiceRoutes from './routes/invoice';
import invoiceItemRoutes, { invoiceItemStandaloneRouter } from './routes/invoiceItem';
import vendorRoutes from './routes/vendor';
import expenseRoutes from './routes/expense';
import expenseServiceRoutes from './routes/expenseService';
import expenseItemRoutes, { expenseItemStandaloneRouter } from './routes/expenseItem';
import monthlyReportRoutes from './routes/monthlyReport';
import fileStorageRoutes from './routes/fileStorage';
import paymentRoutes from './routes/payment';
import agreementRoutes from './routes/agreement';
import clientAuthRoutes from './routes/clientAuth';
import clientInvoiceRoutes from './routes/clientInvoice';
import { errorHandler } from './middleware/errorHandler';
import { processDueReminders } from './services/reminderScheduler';
import * as cron from 'node-cron';
import {
  securityHeaders,
  apiRateLimiter,
  httpParameterPollutionProtection,
  sanitizeInput,
  validateRequestSize,
  securityLogger,
} from './middleware/security';
import { enforceHttps } from './middleware/httpsEnforcer';
import {
  sanitizeUrlParams,
  validateUrlParams,
  decodeUrlIds,
  detectSuspiciousUrls,
} from './middleware/urlSecurity';

// Load environment variables
dotenv.config();

// Validate security configuration on startup
let securityConfig: ReturnType<typeof getSecurityConfig>;
try {
  securityConfig = getSecurityConfig();
  console.log('✅ Security configuration validated');
} catch (error) {
  console.error('❌ Security configuration error:', error);
  if (isProduction()) {
    process.exit(1);
  }
  // In development, use default config
  securityConfig = getSecurityConfig();
}

const app = express();
const PORT: number = Number(process.env.PORT ?? 3000);

// Trust proxy for accurate IP addresses (important for rate limiting)
app.set('trust proxy', 1);

// Security middleware (apply in order)
// 1. HTTPS enforcement (production only)
app.use(enforceHttps);

// 2. Security headers (Helmet)
app.use(securityHeaders);

// 3. CORS configuration with security
app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = securityConfig?.allowedOrigins || [];
      
      // If '*' is specified, allow all origins (public-facing application)
      if (allowedOrigins.includes('*')) {
        return callback(null, true);
      }

      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) {
        if (isProduction() && !allowedOrigins.includes('*')) {
          return callback(new Error('CORS: Origin required in production'));
        }
        return callback(null, true);
      }

      // Check if origin is in allowed list
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`[Security] Blocked CORS request from: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Count'],
    maxAge: 86400, // 24 hours
  })
);

// 4. Request size limits (before body parsers)
app.use(validateRequestSize);

// 5. Body parsers with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 6. HTTP Parameter Pollution protection
app.use(httpParameterPollutionProtection);

// 7. Input sanitization (protect against NoSQL injection and XSS)
app.use(sanitizeInput);

// 8. Security logging
app.use(securityLogger);

// 9. URL security (sanitization, validation, ID decoding)
app.use(detectSuspiciousUrls);
app.use(sanitizeUrlParams);
app.use(validateUrlParams);
app.use(decodeUrlIds);

// 10. General API rate limiting
if (securityConfig?.rateLimitEnabled) {
  app.use('/api', apiRateLimiter);
}

// 11. Static file serving for uploads (logos, etc.)
// Serve static files from the uploads directory
const uploadsPath = path.join(__dirname, '..', 'uploads');
if (fs.existsSync(uploadsPath)) {
  app.use('/uploads', express.static(uploadsPath));
  console.log('✅ Static file serving enabled for uploads directory');
} else {
  console.warn('⚠️  Uploads directory not found, static file serving disabled');
}

// Local file storage removed - all files stored in Azure Blob Storage

// Request logging middleware (non-sensitive requests only)
app.use((req, res, next) => {
  // Skip logging for health checks to reduce noise
  if (req.path !== '/health') {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} [${req.ip}]`);
  }
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    res.status(200).json({
      success: true,
      message: 'Server is healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Server is unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
    });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/master-clients', masterClientRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/expense-services', expenseServiceRoutes);
app.use('/api/items', itemRoutes);
// Invoice items routes must be before invoice routes to avoid route conflicts
app.use('/api/invoices', invoiceItemRoutes); // For /api/invoices/:invoiceId/items
app.use('/api/invoices', invoiceRoutes);
app.use('/api/invoice-items', invoiceItemStandaloneRouter); // For /api/invoice-items/:id
// Expense items routes must be before expense routes to avoid route conflicts
app.use('/api/expenses', expenseItemRoutes); // For /api/expenses/:expenseId/items
app.use('/api/expenses', expenseRoutes);
app.use('/api/expense-items', expenseItemStandaloneRouter);
app.use('/api/monthly-reports', monthlyReportRoutes);
app.use('/api/files', fileStorageRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/agreements', agreementRoutes);

// Client Portal Routes (separate from main API)
app.use('/client-portal/auth', clientAuthRoutes);
app.use('/client-portal/invoices', clientInvoiceRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize database and start server
const initializeDatabase = async () => {
  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection established');

    // Note: In production, use migrations instead of running SQL directly
    // For now, we assume the schema is already created
    // You can run the SQL from src/config/db-schema.sql manually
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
};

// Start server
const startServer = async () => {
  await initializeDatabase();

  // Setup reminder scheduler
  // Run every hour at minute 0 (e.g., 1:00, 2:00, 3:00, etc.)
  // You can change this to run more frequently (e.g., every 30 minutes: '*/30 * * * *')
  // or daily at a specific time (e.g., '0 9 * * *' for 9 AM daily)
  const reminderCronSchedule = process.env.REMINDER_CRON_SCHEDULE || '0 * * * *'; // Every hour by default
  
  cron.schedule(reminderCronSchedule, async () => {
    try {
      console.log('[Reminder Scheduler] Scheduled task triggered');
      const results = await processDueReminders();
      console.log(
        `[Reminder Scheduler] Task completed: ${results.sent} sent, ${results.failed} failed out of ${results.processed} processed`
      );
      if (results.errors.length > 0) {
        console.error('[Reminder Scheduler] Errors:', results.errors);
      }
    } catch (error) {
      console.error('[Reminder Scheduler] Scheduled task error:', error);
    }
  });

  console.log(`⏰ Reminder scheduler configured to run: ${reminderCronSchedule}`);
  console.log(`   (Run 'processDueReminders()' manually or wait for scheduled time)`);

  // Also run immediately on startup to process any overdue reminders
  // This ensures reminders aren't missed if the server was down
  setTimeout(async () => {
    try {
      console.log('[Reminder Scheduler] Running initial check for due reminders...');
      const results = await processDueReminders();
      console.log(
        `[Reminder Scheduler] Initial check completed: ${results.sent} sent, ${results.failed} failed out of ${results.processed} processed`
      );
    } catch (error) {
      console.error('[Reminder Scheduler] Initial check error:', error);
    }
  }, 10000); // Wait 10 seconds after server starts

  // Listen on all network interfaces (0.0.0.0) to allow mobile/remote access
  const HOST = process.env.HOST || '0.0.0.0';
  
  app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🌍 Server accessible on network at http://[YOUR_LOCAL_IP]:${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    const corsDisplay = securityConfig?.allowedOrigins.includes('*') 
      ? 'All origins (*)' 
      : securityConfig?.allowedOrigins.join(', ') || 'All origins (development)';
    console.log(`🌐 CORS enabled for: ${corsDisplay}`);
    console.log(`🔒 Security: Rate limiting ${securityConfig?.rateLimitEnabled ? 'enabled' : 'disabled'}`);
    if (isProduction()) {
      console.log(`⚠️  Production mode: Ensure HTTPS is configured`);
    }
    console.log(`\n📱 To access from mobile device:`);
    console.log(`   1. Find your computer's local IP address (e.g., 192.168.1.100)`);
    console.log(`   2. On mobile, use: http://[YOUR_LOCAL_IP]:${PORT}`);
    console.log(`   3. Set VITE_API_URL=http://[YOUR_LOCAL_IP]:${PORT} in frontend .env`);
  });
};

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  await pool.end();
  process.exit(0);
});

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

