-- Agreements System Migration
-- Creates all tables required for the agreement system

-- Main Agreements Table
CREATE TABLE IF NOT EXISTS agreements (
    id SERIAL PRIMARY KEY,
    "projectId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "serviceProviderName" VARCHAR(255) NOT NULL,
    "agreementDate" DATE NOT NULL,
    "serviceType" VARCHAR(255) NOT NULL,
    "startDate" DATE,
    "endDate" DATE,
    duration INTEGER,
    "durationUnit" VARCHAR(20) CHECK ("durationUnit" IN ('days', 'weeks', 'months')),
    "numberOfRevisions" INTEGER DEFAULT 0,
    jurisdiction VARCHAR(255),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'completed')),
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_agreements_project 
        FOREIGN KEY ("projectId") 
        REFERENCES projects(id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_agreements_user 
        FOREIGN KEY ("userId") 
        REFERENCES users(id) 
        ON DELETE CASCADE
);

-- Indexes for agreements
CREATE INDEX IF NOT EXISTS idx_agreements_project_id ON agreements("projectId");
CREATE INDEX IF NOT EXISTS idx_agreements_user_id ON agreements("userId");
CREATE INDEX IF NOT EXISTS idx_agreements_status ON agreements(status);

-- Trigger to automatically update updatedAt for agreements
CREATE TRIGGER update_agreements_updated_at BEFORE UPDATE ON agreements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Agreement Deliverables Table
CREATE TABLE IF NOT EXISTS agreement_deliverables (
    id SERIAL PRIMARY KEY,
    "agreementId" INTEGER NOT NULL,
    description TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_agreement_deliverables_agreement 
        FOREIGN KEY ("agreementId") 
        REFERENCES agreements(id) 
        ON DELETE CASCADE
);

-- Indexes for agreement_deliverables
CREATE INDEX IF NOT EXISTS idx_agreement_deliverables_agreement_id ON agreement_deliverables("agreementId");

-- Agreement Payment Terms Table
CREATE TABLE IF NOT EXISTS agreement_payment_terms (
    id SERIAL PRIMARY KEY,
    "agreementId" INTEGER NOT NULL,
    "paymentStructure" VARCHAR(50) NOT NULL CHECK ("paymentStructure" IN ('50-50', '100-upfront', '100-completion', 'milestone-based')),
    "paymentMethod" VARCHAR(255),
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_agreement_payment_terms_agreement 
        FOREIGN KEY ("agreementId") 
        REFERENCES agreements(id) 
        ON DELETE CASCADE
);

-- Indexes for agreement_payment_terms
CREATE INDEX IF NOT EXISTS idx_agreement_payment_terms_agreement_id ON agreement_payment_terms("agreementId");

-- Agreement Payment Milestones Table
CREATE TABLE IF NOT EXISTS agreement_payment_milestones (
    id SERIAL PRIMARY KEY,
    "agreementPaymentTermId" INTEGER NOT NULL,
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "milestoneDate" DATE,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_agreement_payment_milestones_payment_term 
        FOREIGN KEY ("agreementPaymentTermId") 
        REFERENCES agreement_payment_terms(id) 
        ON DELETE CASCADE
);

-- Indexes for agreement_payment_milestones
CREATE INDEX IF NOT EXISTS idx_agreement_payment_milestones_payment_term_id ON agreement_payment_milestones("agreementPaymentTermId");

-- Add status column to agreement_payment_milestones (for invoice generation tracking)
-- Default status is 'pending', changes to 'created' when invoice is created
ALTER TABLE agreement_payment_milestones 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending' 
CHECK (status IN ('pending', 'created'));

CREATE INDEX IF NOT EXISTS idx_agreement_payment_milestones_status 
ON agreement_payment_milestones(status);

CREATE INDEX IF NOT EXISTS idx_agreement_payment_milestones_date_status 
ON agreement_payment_milestones("milestoneDate", status);

-- Agreement Signatures Table
CREATE TABLE IF NOT EXISTS agreement_signatures (
    id SERIAL PRIMARY KEY,
    "agreementId" INTEGER NOT NULL,
    "signerType" VARCHAR(20) NOT NULL CHECK ("signerType" IN ('service_provider', 'client')),
    "clientId" INTEGER,
    "signerName" VARCHAR(255) NOT NULL,
    "signatureImageName" VARCHAR(255) NOT NULL,
    "signatureImagePath" TEXT NOT NULL,
    "ipAddress" VARCHAR(45),
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentId" VARCHAR(255),
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_agreement_signatures_agreement 
        FOREIGN KEY ("agreementId") 
        REFERENCES agreements(id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_agreement_signatures_client 
        FOREIGN KEY ("clientId") 
        REFERENCES master_clients(id) 
        ON DELETE SET NULL
);

-- Indexes for agreement_signatures
CREATE INDEX IF NOT EXISTS idx_agreement_signatures_agreement_id ON agreement_signatures("agreementId");
CREATE INDEX IF NOT EXISTS idx_agreement_signatures_client_id ON agreement_signatures("clientId");
CREATE INDEX IF NOT EXISTS idx_agreement_signatures_signer_type ON agreement_signatures("signerType");

-- Agreement Client Links Table
CREATE TABLE IF NOT EXISTS agreement_client_links (
    id SERIAL PRIMARY KEY,
    "agreementId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    "expiresAt" TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'client_signed', 'expired')),
    "emailSentAt" TIMESTAMP,
    "signedAt" TIMESTAMP,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_agreement_client_links_agreement 
        FOREIGN KEY ("agreementId") 
        REFERENCES agreements(id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_agreement_client_links_client 
        FOREIGN KEY ("clientId") 
        REFERENCES master_clients(id) 
        ON DELETE CASCADE
);

-- Indexes for agreement_client_links
CREATE INDEX IF NOT EXISTS idx_agreement_client_links_agreement_id ON agreement_client_links("agreementId");
CREATE INDEX IF NOT EXISTS idx_agreement_client_links_client_id ON agreement_client_links("clientId");
CREATE INDEX IF NOT EXISTS idx_agreement_client_links_token ON agreement_client_links(token);
CREATE INDEX IF NOT EXISTS idx_agreement_client_links_expires_at ON agreement_client_links("expiresAt");
CREATE INDEX IF NOT EXISTS idx_agreement_client_links_status ON agreement_client_links(status);
