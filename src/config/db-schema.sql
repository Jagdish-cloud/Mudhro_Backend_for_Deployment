-- Users Table Schema
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    "fullName" VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    country VARCHAR(100),
    "mobileNumber" VARCHAR(20),
    "planId" VARCHAR(50),
    logo TEXT,
    gstin VARCHAR(15),
    pan VARCHAR(10),
    "emailVerified" BOOLEAN DEFAULT FALSE,
    "isActive" BOOLEAN DEFAULT TRUE,
    "isTwoFactorEnabled" BOOLEAN DEFAULT FALSE,
    "twoFactorSecret" VARCHAR(255),
    "lastLogin" TIMESTAMP,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "loginAttempts" INTEGER DEFAULT 0,
    "refreshToken" TEXT,
    "jwtIssuedAt" TIMESTAMP,
    "jwtExpiresAt" TIMESTAMP,
    currency VARCHAR(3) DEFAULT 'INR'
);

-- Indexes for better query performance
-- Note: PRIMARY KEY on id automatically creates an index, so idx_users_id is not needed
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users("isActive");

-- Function to update updatedAt timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updatedAt
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- User Sessions Table Schema (Login/Logout Tracking)
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "loginAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logoutAt" TIMESTAMP,
    "ipAddress" VARCHAR(45),
    "userAgent" TEXT,
    "sessionDuration" INTEGER, -- Duration in seconds
    "expenseScreenVisitCount" INTEGER DEFAULT 0, -- Count of expense screen visits
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_sessions_user 
        FOREIGN KEY ("userId") 
        REFERENCES users(id) 
        ON DELETE CASCADE
);

-- Indexes for user_sessions
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions("userId");
CREATE INDEX IF NOT EXISTS idx_user_sessions_login_at ON user_sessions("loginAt");
CREATE INDEX IF NOT EXISTS idx_user_sessions_logout_at ON user_sessions("logoutAt");

-- Trigger to automatically update updatedAt for user_sessions
CREATE TRIGGER update_user_sessions_updated_at BEFORE UPDATE ON user_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Master Clients Table Schema
CREATE TABLE IF NOT EXISTS master_clients (
    id SERIAL PRIMARY KEY,
    organization VARCHAR(255),
    "fullName" VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    "mobileNumber" VARCHAR(20),
    gstin VARCHAR(15),
    pan VARCHAR(10),
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_master_clients_user 
        FOREIGN KEY ("userId") 
        REFERENCES users(id) 
        ON DELETE CASCADE
);

-- Client Documents Table Schema (up to 5 documents per client)
CREATE TABLE IF NOT EXISTS client_documents (
    id SERIAL PRIMARY KEY,
    "clientId" INTEGER NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" VARCHAR(100),
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_client_documents_client 
        FOREIGN KEY ("clientId") 
        REFERENCES master_clients(id) 
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_client_documents_client_id ON client_documents("clientId");
CREATE TRIGGER update_client_documents_updated_at BEFORE UPDATE ON client_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_master_clients_user_id ON master_clients("userId");
CREATE INDEX IF NOT EXISTS idx_master_clients_email ON master_clients(email);
CREATE INDEX IF NOT EXISTS idx_master_clients_user_email ON master_clients("userId", email);

-- Trigger to automatically update updatedAt for master_clients
CREATE TRIGGER update_master_clients_updated_at BEFORE UPDATE ON master_clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Projects Table Schema
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    "startDate" DATE,
    "endDate" DATE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on-hold', 'cancelled')),
    budget DECIMAL(15, 2),
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_projects_user 
        FOREIGN KEY ("userId") 
        REFERENCES users(id) 
        ON DELETE CASCADE
);

-- Indexes for projects
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects("userId");
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_dates ON projects("startDate", "endDate");

-- Trigger to automatically update updatedAt for projects
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Project-Clients Junction Table (Many-to-Many Relationship)
CREATE TABLE IF NOT EXISTS project_clients (
    id SERIAL PRIMARY KEY,
    "projectId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_project_clients_project 
        FOREIGN KEY ("projectId") 
        REFERENCES projects(id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_project_clients_client 
        FOREIGN KEY ("clientId") 
        REFERENCES master_clients(id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_project_clients_user 
        FOREIGN KEY ("userId") 
        REFERENCES users(id) 
        ON DELETE CASCADE,
    CONSTRAINT uq_project_clients 
        UNIQUE ("projectId", "clientId")
);

-- Indexes for project_clients
CREATE INDEX IF NOT EXISTS idx_project_clients_project_id ON project_clients("projectId");
CREATE INDEX IF NOT EXISTS idx_project_clients_client_id ON project_clients("clientId");
CREATE INDEX IF NOT EXISTS idx_project_clients_user_id ON project_clients("userId");
CREATE INDEX IF NOT EXISTS idx_project_clients_composite ON project_clients("projectId", "clientId");

-- Trigger to automatically update updatedAt for project_clients
CREATE TRIGGER update_project_clients_updated_at BEFORE UPDATE ON project_clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add projectId column to master_clients table (DEPRECATED: kept for backward compatibility)
ALTER TABLE master_clients
    ADD COLUMN IF NOT EXISTS "projectId" INTEGER;

-- Add foreign key constraint for projectId
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_master_clients_project'
    ) THEN
        ALTER TABLE master_clients
            ADD CONSTRAINT fk_master_clients_project 
            FOREIGN KEY ("projectId") 
            REFERENCES projects(id) 
            ON DELETE SET NULL;
    END IF;
END $$;

-- Add index on projectId
CREATE INDEX IF NOT EXISTS idx_master_clients_project_id ON master_clients("projectId");

-- Vendors Table Schema
CREATE TABLE IF NOT EXISTS vendors (
    id SERIAL PRIMARY KEY,
    organization VARCHAR(255),
    "fullName" VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    "mobileNumber" VARCHAR(20),
    gstin VARCHAR(15),
    pan VARCHAR(10),
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vendors_user 
        FOREIGN KEY ("userId") 
        REFERENCES users(id) 
        ON DELETE CASCADE
);

-- Vendor Documents Table Schema (up to 5 documents per vendor)
CREATE TABLE IF NOT EXISTS vendor_documents (
    id SERIAL PRIMARY KEY,
    "vendorId" INTEGER NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" VARCHAR(100),
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vendor_documents_vendor 
        FOREIGN KEY ("vendorId") 
        REFERENCES vendors(id) 
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vendor_documents_vendor_id ON vendor_documents("vendorId");
CREATE TRIGGER update_vendor_documents_updated_at BEFORE UPDATE ON vendor_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_vendors_user_id ON vendors("userId");
CREATE INDEX IF NOT EXISTS idx_vendors_email ON vendors(email);
CREATE INDEX IF NOT EXISTS idx_vendors_user_email ON vendors("userId", email);

-- Trigger to automatically update updatedAt for vendors
CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON vendors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_items_user 
        FOREIGN KEY ("userId") 
        REFERENCES users(id) 
        ON DELETE CASCADE
);

-- Indexes for items
CREATE INDEX IF NOT EXISTS idx_items_user_id ON items("userId");

-- Trigger to automatically update updatedAt for items
CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Expense Service Catalog Table Schema
CREATE TABLE IF NOT EXISTS expense_service (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    "defaultRate" DECIMAL(15, 2) NOT NULL DEFAULT 0,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_expense_service_user 
        FOREIGN KEY ("userId") 
        REFERENCES users(id) 
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_expense_service_user_id ON expense_service("userId");
CREATE INDEX IF NOT EXISTS idx_expense_service_name ON expense_service("userId", name);

CREATE TRIGGER update_expense_service_updated_at BEFORE UPDATE ON expense_service
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sequence for Invoice Numbers (INV00001, INV00002, etc.)
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1;

-- Function to generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS VARCHAR(20) AS $$
DECLARE
    next_num INTEGER;
    invoice_num VARCHAR(20);
BEGIN
    next_num := nextval('invoice_number_seq');
    invoice_num := 'INV' || LPAD(next_num::TEXT, 5, '0');
    RETURN invoice_num;
END;
$$ LANGUAGE plpgsql;

-- Invoices Table Schema
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "invoiceNumber" VARCHAR(20) UNIQUE,
    invoice_file_name VARCHAR(255),
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "subTotalAmount" DECIMAL(15, 2) NOT NULL DEFAULT 0,
    gst DECIMAL(5, 2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(15, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'INR',
    "totalInstallments" INTEGER NOT NULL DEFAULT 1,
    "currentInstallment" INTEGER NOT NULL DEFAULT 1,
    "additionalNotes" TEXT DEFAULT 'Thank you for your business',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'overdue')),
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_invoices_user 
        FOREIGN KEY ("userId") 
        REFERENCES users(id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_invoices_client 
        FOREIGN KEY ("clientId") 
        REFERENCES master_clients(id) 
        ON DELETE RESTRICT
);

-- Ensure invoice_file_name column exists and is populated for existing databases
ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS invoice_file_name VARCHAR(255);

-- Ensure currency column exists for existing databases
ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'INR';

-- Ensure paymentReminderRepetition column exists for existing databases
ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS "paymentReminderRepetition" TEXT DEFAULT NULL;

-- Migrate existing paymentReminderRepetition column from VARCHAR(20) to TEXT to support JSON arrays
ALTER TABLE invoices
    ALTER COLUMN "paymentReminderRepetition" TYPE TEXT;

-- Ensure status column exists for existing databases
ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';

-- Add CHECK constraint for status if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'invoices_status_check'
    ) THEN
        ALTER TABLE invoices
            ADD CONSTRAINT invoices_status_check 
            CHECK (status IN ('paid', 'pending', 'overdue'));
    END IF;
END $$;

-- Migrate existing status from additionalNotes to status column
-- Extract status from additionalNotes format: "STATUS:paid|..." or "STATUS:pending|..." or "STATUS:overdue|..."
UPDATE invoices
SET status = CASE
    WHEN "additionalNotes" LIKE 'STATUS:paid|%' THEN 'paid'
    WHEN "additionalNotes" LIKE 'STATUS:pending|%' THEN 'pending'
    WHEN "additionalNotes" LIKE 'STATUS:overdue|%' THEN 'overdue'
    ELSE CASE
        WHEN "dueDate" < CURRENT_DATE THEN 'overdue'
        ELSE 'pending'
    END
END
WHERE status = 'pending' OR status IS NULL;

-- Clean up additionalNotes by removing status prefix
UPDATE invoices
SET "additionalNotes" = CASE
    WHEN "additionalNotes" LIKE 'STATUS:%|%' THEN 
        SUBSTRING("additionalNotes" FROM POSITION('|' IN "additionalNotes") + 1)
    WHEN "additionalNotes" LIKE 'STATUS:%' THEN 
        NULL
    ELSE 
        "additionalNotes"
END
WHERE "additionalNotes" LIKE 'STATUS:%';

-- Set default status for any remaining NULL values
UPDATE invoices
SET status = CASE
    WHEN "dueDate" < CURRENT_DATE THEN 'overdue'
    ELSE 'pending'
END
WHERE status IS NULL;

-- Add payment terms columns to invoices table
ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS "paymentTerms" VARCHAR(20) DEFAULT 'full' CHECK ("paymentTerms" IN ('full', 'advance_balance'));

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS "advanceAmount" DECIMAL(15, 2) DEFAULT NULL;

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS "balanceDue" DECIMAL(15, 2) DEFAULT NULL;

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS "balanceDueDate" DATE DEFAULT NULL;

-- Add projectId column to invoices table
ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS "projectId" INTEGER DEFAULT NULL;

-- Add foreign key constraint for projectId
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_invoices_project'
    ) THEN
        ALTER TABLE invoices
            ADD CONSTRAINT fk_invoices_project 
            FOREIGN KEY ("projectId") 
            REFERENCES projects(id) 
            ON DELETE SET NULL;
    END IF;
END $$;

-- Add index on projectId
CREATE INDEX IF NOT EXISTS idx_invoices_project_id ON invoices("projectId");

-- Ensure expenseScreenVisitCount column exists for existing databases
ALTER TABLE user_sessions
    ADD COLUMN IF NOT EXISTS "expenseScreenVisitCount" INTEGER DEFAULT 0;

UPDATE invoices
SET invoice_file_name = CASE
    WHEN invoice_file_name IS NULL OR invoice_file_name = '' THEN
        CASE
            WHEN "invoiceNumber" IS NULL OR "invoiceNumber" = '' THEN NULL
            WHEN RIGHT("invoiceNumber", 4) = '.pdf' THEN "invoiceNumber"
            ELSE "invoiceNumber" || '.pdf'
        END
    ELSE
        CASE
            WHEN POSITION('/' IN invoice_file_name) > 0 THEN regexp_replace(invoice_file_name, '^.*/', '')
            ELSE invoice_file_name
        END
END;

-- Indexes for invoices
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices("userId");
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices("clientId");
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices("invoiceNumber");
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices("invoiceDate");

-- Trigger to automatically generate invoice number if not provided
CREATE OR REPLACE FUNCTION set_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."invoiceNumber" IS NULL OR NEW."invoiceNumber" = '' THEN
        NEW."invoiceNumber" := generate_invoice_number();
    END IF;
    IF NEW.invoice_file_name IS NULL OR NEW.invoice_file_name = '' THEN
        IF NEW."invoiceNumber" IS NOT NULL AND NEW."invoiceNumber" <> '' THEN
            IF RIGHT(NEW."invoiceNumber", 4) = '.pdf' THEN
                NEW.invoice_file_name := NEW."invoiceNumber";
            ELSE
                NEW.invoice_file_name := NEW."invoiceNumber" || '.pdf';
            END IF;
        ELSE
            NEW.invoice_file_name := NULL;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_invoice_number_trigger ON invoices;
CREATE TRIGGER set_invoice_number_trigger
    BEFORE INSERT OR UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION set_invoice_number();

-- Trigger to automatically update updatedAt for invoices
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- InvoiceItems Table Schema
CREATE TABLE IF NOT EXISTS invoice_items (
    id SERIAL PRIMARY KEY,
    "invoiceId" INTEGER NOT NULL,
    "itemsId" INTEGER NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(15, 2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_invoice_items_invoice 
        FOREIGN KEY ("invoiceId") 
        REFERENCES invoices(id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_invoice_items_item 
        FOREIGN KEY ("itemsId") 
        REFERENCES items(id) 
        ON DELETE RESTRICT
);

-- Indexes for invoice_items
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items("invoiceId");
CREATE INDEX IF NOT EXISTS idx_invoice_items_item_id ON invoice_items("itemsId");

-- Trigger to automatically update updatedAt for invoice_items
CREATE TRIGGER update_invoice_items_updated_at BEFORE UPDATE ON invoice_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Payment Reminders Table Schema
CREATE TABLE IF NOT EXISTS payment_reminders (
    id SERIAL PRIMARY KEY,
    "invoiceId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "reminderType" VARCHAR(20) NOT NULL, -- '3', '7', 'Only on Due date', 'Manual'
    "scheduledDate" DATE NOT NULL,
    "sentAt" TIMESTAMP,
    "isSent" BOOLEAN DEFAULT FALSE,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payment_reminders_invoice 
        FOREIGN KEY ("invoiceId") 
        REFERENCES invoices(id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_payment_reminders_user 
        FOREIGN KEY ("userId") 
        REFERENCES users(id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_payment_reminders_client 
        FOREIGN KEY ("clientId") 
        REFERENCES master_clients(id) 
        ON DELETE CASCADE
);

-- Ensure userId and clientId columns exist for existing databases
ALTER TABLE payment_reminders
    ADD COLUMN IF NOT EXISTS "userId" INTEGER;
ALTER TABLE payment_reminders
    ADD COLUMN IF NOT EXISTS "clientId" INTEGER;

-- Update existing records to populate userId and clientId from invoices
UPDATE payment_reminders pr
SET "userId" = i."userId", "clientId" = i."clientId"
FROM invoices i
WHERE pr."invoiceId" = i.id AND (pr."userId" IS NULL OR pr."clientId" IS NULL);

-- Delete any orphaned records (shouldn't happen due to foreign key, but just in case)
DELETE FROM payment_reminders 
WHERE "userId" IS NULL OR "clientId" IS NULL;

-- Add NOT NULL constraints after populating data
DO $$
BEGIN
    -- Only set NOT NULL if there are no NULL values
    IF NOT EXISTS (SELECT 1 FROM payment_reminders WHERE "userId" IS NULL OR "clientId" IS NULL) THEN
        ALTER TABLE payment_reminders ALTER COLUMN "userId" SET NOT NULL;
        ALTER TABLE payment_reminders ALTER COLUMN "clientId" SET NOT NULL;
    END IF;
END $$;

-- Add foreign key constraints if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_payment_reminders_user'
    ) THEN
        ALTER TABLE payment_reminders
            ADD CONSTRAINT fk_payment_reminders_user 
            FOREIGN KEY ("userId") 
            REFERENCES users(id) 
            ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_payment_reminders_client'
    ) THEN
        ALTER TABLE payment_reminders
            ADD CONSTRAINT fk_payment_reminders_client 
            FOREIGN KEY ("clientId") 
            REFERENCES master_clients(id) 
            ON DELETE CASCADE;
    END IF;
END $$;

-- Indexes for payment_reminders
CREATE INDEX IF NOT EXISTS idx_payment_reminders_invoice_id ON payment_reminders("invoiceId");
CREATE INDEX IF NOT EXISTS idx_payment_reminders_user_id ON payment_reminders("userId");
CREATE INDEX IF NOT EXISTS idx_payment_reminders_client_id ON payment_reminders("clientId");
CREATE INDEX IF NOT EXISTS idx_payment_reminders_scheduled_date ON payment_reminders("scheduledDate");
CREATE INDEX IF NOT EXISTS idx_payment_reminders_is_sent ON payment_reminders("isSent");
CREATE INDEX IF NOT EXISTS idx_payment_reminders_invoice_sent ON payment_reminders("invoiceId", "isSent");

-- Trigger to automatically update updatedAt for payment_reminders
CREATE TRIGGER update_payment_reminders_updated_at BEFORE UPDATE ON payment_reminders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sequence for Expense Numbers (BILL00001, BILL00002, etc.)
CREATE SEQUENCE IF NOT EXISTS expense_number_seq START WITH 1;

-- Function to generate bill number
CREATE OR REPLACE FUNCTION generate_bill_number()
RETURNS VARCHAR(20) AS $$
DECLARE
    next_num INTEGER;
    bill_num VARCHAR(20);
BEGIN
    next_num := nextval('expense_number_seq');
    bill_num := 'BILL' || LPAD(next_num::TEXT, 5, '0');
    RETURN bill_num;
END;
$$ LANGUAGE plpgsql;

-- Expenses Table Schema
CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "vendorId" INTEGER NOT NULL,
    "billNumber" VARCHAR(20) UNIQUE,
    "billDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "taxPercentage" DECIMAL(5, 2) NOT NULL DEFAULT 0,
    "subTotalAmount" DECIMAL(15, 2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(15, 2) NOT NULL DEFAULT 0,
    "attachmentFileName" VARCHAR(255),
    expense_file_name VARCHAR(255),
    "additionalNotes" TEXT,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_expenses_user 
        FOREIGN KEY ("userId") 
        REFERENCES users(id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_expenses_vendor 
        FOREIGN KEY ("vendorId") 
        REFERENCES vendors(id) 
        ON DELETE RESTRICT
);

-- Ensure expense_file_name column exists for existing databases
ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS expense_file_name VARCHAR(255);

-- Indexes for expenses
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses("userId");
CREATE INDEX IF NOT EXISTS idx_expenses_vendor_id ON expenses("vendorId");
CREATE INDEX IF NOT EXISTS idx_expenses_bill_number ON expenses("billNumber");
CREATE INDEX IF NOT EXISTS idx_expenses_bill_date ON expenses("billDate");

-- Trigger to automatically generate bill number if not provided
CREATE OR REPLACE FUNCTION set_bill_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."billNumber" IS NULL OR NEW."billNumber" = '' THEN
        NEW."billNumber" := generate_bill_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_bill_number_trigger ON expenses;
CREATE TRIGGER set_bill_number_trigger
    BEFORE INSERT OR UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION set_bill_number();

-- Trigger to automatically update updatedAt for expenses
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS "taxPercentage" DECIMAL(5, 2) NOT NULL DEFAULT 0;

-- Remove installments columns and add new columns
ALTER TABLE expenses
    DROP COLUMN IF EXISTS "totalInstallments",
    DROP COLUMN IF EXISTS "currentInstallment";

ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS "subTotalAmount" DECIMAL(15, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "attachmentFileName" VARCHAR(255);

CREATE TABLE IF NOT EXISTS expense_items (
    id SERIAL PRIMARY KEY,
    "expenseId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(15, 2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_expense_items_expense 
        FOREIGN KEY ("expenseId") 
        REFERENCES expenses(id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_expense_items_service 
        FOREIGN KEY ("serviceId") 
        REFERENCES expense_service(id) 
        ON DELETE RESTRICT
);

-- Indexes for expense_items
CREATE INDEX IF NOT EXISTS idx_expense_items_expense_id ON expense_items("expenseId");
CREATE INDEX IF NOT EXISTS idx_expense_items_service_id ON expense_items("serviceId");

-- Trigger to automatically update updatedAt for expense_items
CREATE TRIGGER update_expense_items_updated_at BEFORE UPDATE ON expense_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Payments Table Schema
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    "invoiceId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "invoiceAmount" DECIMAL(15, 2) NOT NULL,
    "amountReceived" DECIMAL(15, 2) NOT NULL,
    "paymentGatewayFee" DECIMAL(15, 2) DEFAULT 0,
    "tdsDeducted" DECIMAL(15, 2) DEFAULT 0,
    "otherDeduction" DECIMAL(15, 2) DEFAULT 0,
    "finalAmount" DECIMAL(15, 2) NOT NULL,
    "paymentDate" DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payments_invoice 
        FOREIGN KEY ("invoiceId") 
        REFERENCES invoices(id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_payments_user 
        FOREIGN KEY ("userId") 
        REFERENCES users(id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_payments_client 
        FOREIGN KEY ("clientId") 
        REFERENCES master_clients(id) 
        ON DELETE CASCADE
);

-- Indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments("invoiceId");
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments("userId");
CREATE INDEX IF NOT EXISTS idx_payments_client_id ON payments("clientId");
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments("paymentDate");

-- Trigger to automatically update updatedAt for payments
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Client Notes Table Schema
CREATE TABLE IF NOT EXISTS client_notes (
    id SERIAL PRIMARY KEY,
    "clientId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    note TEXT NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_client_notes_client 
        FOREIGN KEY ("clientId") 
        REFERENCES master_clients(id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_client_notes_user 
        FOREIGN KEY ("userId") 
        REFERENCES users(id) 
        ON DELETE CASCADE
);

-- Indexes for client_notes
CREATE INDEX IF NOT EXISTS idx_client_notes_client_id ON client_notes("clientId");
CREATE INDEX IF NOT EXISTS idx_client_notes_user_id ON client_notes("userId");
CREATE INDEX IF NOT EXISTS idx_client_notes_created_at ON client_notes("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_client_notes_client_created_at ON client_notes("clientId", "createdAt" DESC);

-- Trigger to automatically update updatedAt for client_notes
CREATE TRIGGER update_client_notes_updated_at BEFORE UPDATE ON client_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Vendor Notes Table Schema
CREATE TABLE IF NOT EXISTS vendor_notes (
    id SERIAL PRIMARY KEY,
    "vendorId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    note TEXT NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vendor_notes_vendor 
        FOREIGN KEY ("vendorId") 
        REFERENCES vendors(id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_vendor_notes_user 
        FOREIGN KEY ("userId") 
        REFERENCES users(id) 
        ON DELETE CASCADE
);

-- Indexes for vendor_notes
CREATE INDEX IF NOT EXISTS idx_vendor_notes_vendor_id ON vendor_notes("vendorId");
CREATE INDEX IF NOT EXISTS idx_vendor_notes_user_id ON vendor_notes("userId");
CREATE INDEX IF NOT EXISTS idx_vendor_notes_created_at ON vendor_notes("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_notes_vendor_created_at ON vendor_notes("vendorId", "createdAt" DESC);

-- Trigger to automatically update updatedAt for vendor_notes
CREATE TRIGGER update_vendor_notes_updated_at BEFORE UPDATE ON vendor_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

