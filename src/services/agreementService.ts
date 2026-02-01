import pool from '../config/database';
import { AppError } from '../middleware/errorHandler';
import BlobStorageService, { FileType } from './blobStorageService';
import { sendMail } from './mailer';
import { buildAgreementEmail } from '../utils/emailTemplates';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';

export interface AgreementCreateData {
  projectId: number;
  userId: number;
  serviceProviderName: string;
  agreementDate: string | Date;
  serviceType: string;
  startDate?: string | Date;
  endDate?: string | Date;
  duration?: number;
  durationUnit?: 'days' | 'weeks' | 'months';
  numberOfRevisions: number;
  jurisdiction?: string;
  deliverables: string[];
  paymentStructure: '50-50' | '100-upfront' | '100-completion' | 'milestone-based';
  paymentMethod?: string;
  paymentMilestones?: Array<{ description: string; amount: number; date?: string }>;
  serviceProviderSignature: {
    signerName: string;
    signatureImage: string; // base64 image
  };
}

export interface AgreementResponse {
  id: number;
  projectId: number;
  userId: number;
  serviceProviderName: string;
  agreementDate: Date;
  serviceType: string;
  startDate?: Date;
  endDate?: Date;
  duration?: number;
  durationUnit?: 'days' | 'weeks' | 'months';
  numberOfRevisions: number;
  jurisdiction?: string;
  status: 'draft' | 'pending' | 'completed';
  deliverables: Array<{ id: number; description: string; order: number }>;
  paymentTerms: {
    id: number;
    paymentStructure: string;
    paymentMethod?: string;
    milestones?: Array<{ id: number; description: string; amount: number; order: number; date?: string; status?: string }>;
  };
  signatures: Array<{
    id: number;
    signerType: 'service_provider' | 'client';
    clientId?: number;
    signerName: string;
    signatureImageName: string;
    signatureImagePath?: string;
    timestamp: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Generate a secure random token for client signature links
 */
export const generateClientSignatureToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Create a new agreement with all related data
 */
export const createAgreement = async (
  agreementData: AgreementCreateData
): Promise<AgreementResponse> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verify project exists and belongs to user
    const projectCheck = await client.query(
      'SELECT id, name FROM projects WHERE id = $1 AND "userId" = $2',
      [agreementData.projectId, agreementData.userId]
    );

    if (projectCheck.rows.length === 0) {
      throw new AppError('Project not found or unauthorized', 404);
    }

    const projectName = projectCheck.rows[0].name;

    // Insert main agreement
    const agreementResult = await client.query(
      `INSERT INTO agreements (
        "projectId", "userId", "serviceProviderName", "agreementDate", "serviceType",
        "startDate", "endDate", duration, "durationUnit", "numberOfRevisions", jurisdiction, status,
        "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, "projectId", "userId", "serviceProviderName", "agreementDate", "serviceType",
        "startDate", "endDate", duration, "durationUnit", "numberOfRevisions", jurisdiction, status,
        "createdAt", "updatedAt"`,
      [
        agreementData.projectId,
        agreementData.userId,
        agreementData.serviceProviderName,
        agreementData.agreementDate,
        agreementData.serviceType,
        agreementData.startDate || null,
        agreementData.endDate || null,
        agreementData.duration || null,
        agreementData.durationUnit || null,
        agreementData.numberOfRevisions,
        agreementData.jurisdiction || null,
        'draft',
      ]
    );

    const agreementId = agreementResult.rows[0].id;

    // Insert deliverables
    if (agreementData.deliverables && agreementData.deliverables.length > 0) {
      for (let i = 0; i < agreementData.deliverables.length; i++) {
        await client.query(
          `INSERT INTO agreement_deliverables ("agreementId", description, "order", "createdAt")
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
          [agreementId, agreementData.deliverables[i], i]
        );
      }
    }

    // Insert payment terms
    const paymentTermResult = await client.query(
      `INSERT INTO agreement_payment_terms ("agreementId", "paymentStructure", "paymentMethod", "createdAt")
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       RETURNING id`,
      [
        agreementId,
        agreementData.paymentStructure,
        agreementData.paymentMethod || null,
      ]
    );

    const paymentTermId = paymentTermResult.rows[0].id;

    // Insert payment milestones if milestone-based
    if (
      agreementData.paymentStructure === 'milestone-based' &&
      agreementData.paymentMilestones &&
      agreementData.paymentMilestones.length > 0
    ) {
      for (let i = 0; i < agreementData.paymentMilestones.length; i++) {
        await client.query(
          `INSERT INTO agreement_payment_milestones 
           ("agreementPaymentTermId", description, amount, "order", "milestoneDate", "createdAt")
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
          [
            paymentTermId,
            agreementData.paymentMilestones[i].description,
            agreementData.paymentMilestones[i].amount,
            i,
            agreementData.paymentMilestones[i].date || null,
          ]
        );
      }
    }

    // Handle service provider signature
    if (agreementData.serviceProviderSignature) {
      const signatureImage = agreementData.serviceProviderSignature.signatureImage;
      const timestamp = Date.now();
      const fileName = `signature-${timestamp}.png`;
      
      // Convert base64 to buffer
      const base64Data = signatureImage.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');

      // Upload signature to Azure Blob Storage
      const blobPath = await BlobStorageService.uploadFile(
        imageBuffer,
        fileName,
        FileType.SIGNATURES,
        agreementData.projectId,
        'image/png'
      );

      // Generate document ID
      const documentId = `AGREEMENT-${agreementId}-${Date.now()}`;

      // Insert signature
      await client.query(
        `INSERT INTO agreement_signatures (
          "agreementId", "signerType", "signerName", "signatureImageName", "signatureImagePath",
          timestamp, "documentId", "createdAt"
        ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, CURRENT_TIMESTAMP)`,
        [
          agreementId,
          'service_provider',
          agreementData.serviceProviderSignature.signerName,
          fileName,
          blobPath,
          documentId,
        ]
      );
    }

    await client.query('COMMIT');

    // Fetch and return complete agreement
    return await getAgreementById(agreementId, agreementData.userId);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error creating agreement:', error);
    throw new AppError('Failed to create agreement', 500);
  } finally {
    client.release();
  }
};

/**
 * Get agreement by ID
 */
export const getAgreementById = async (
  agreementId: number,
  userId: number
): Promise<AgreementResponse> => {
  const client = await pool.connect();

  try {
    // Get main agreement
    const agreementResult = await client.query(
      `SELECT id, "projectId", "userId", "serviceProviderName", "agreementDate", "serviceType",
        "startDate", "endDate", duration, "durationUnit", "numberOfRevisions", jurisdiction, status,
        "createdAt", "updatedAt"
       FROM agreements
       WHERE id = $1 AND "userId" = $2`,
      [agreementId, userId]
    );

    if (agreementResult.rows.length === 0) {
      throw new AppError('Agreement not found', 404);
    }

    const agreement = agreementResult.rows[0];

    // Get deliverables
    const deliverablesResult = await client.query(
      `SELECT id, description, "order"
       FROM agreement_deliverables
       WHERE "agreementId" = $1
       ORDER BY "order"`,
      [agreementId]
    );

    // Get payment terms
    const paymentTermsResult = await client.query(
      `SELECT id, "paymentStructure", "paymentMethod"
       FROM agreement_payment_terms
       WHERE "agreementId" = $1`,
      [agreementId]
    );

    let paymentTerms: any = null;
    if (paymentTermsResult.rows.length > 0) {
      const paymentTerm = paymentTermsResult.rows[0];
      paymentTerms = {
        id: paymentTerm.id,
        paymentStructure: paymentTerm.paymentStructure,
        paymentMethod: paymentTerm.paymentMethod,
      };

      // Get milestones if milestone-based
      if (paymentTerm.paymentStructure === 'milestone-based') {
        // Format milestoneDate directly in SQL using TO_CHAR to avoid timezone conversion issues
        // This ensures we get the exact date string as stored in the database
        const milestonesResult = await client.query(
          `SELECT id, description, amount, "order", 
                  TO_CHAR("milestoneDate", 'YYYY-MM-DD') as "milestoneDate", 
                  status, "createdAt"
           FROM agreement_payment_milestones
           WHERE "agreementPaymentTermId" = $1
           ORDER BY "order"`,
          [paymentTerm.id]
        );
        paymentTerms.milestones = milestonesResult.rows.map((m: any) => ({
          id: m.id,
          description: m.description,
          amount: m.amount,
          order: m.order,
          date: m.milestoneDate || undefined, // Already formatted as YYYY-MM-DD string from SQL
          status: m.status || 'pending', // Default to 'pending' for backward compatibility
          createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : undefined,
        }));
      }
    }

    // Get signatures
    const signaturesResult = await client.query(
      `SELECT id, "signerType", "clientId", "signerName", "signatureImageName", "signatureImagePath", timestamp
       FROM agreement_signatures
       WHERE "agreementId" = $1
       ORDER BY "createdAt"`,
      [agreementId]
    );

    return {
      id: agreement.id,
      projectId: agreement.projectId,
      userId: agreement.userId,
      serviceProviderName: agreement.serviceProviderName,
      agreementDate: new Date(agreement.agreementDate),
      serviceType: agreement.serviceType,
      startDate: agreement.startDate ? new Date(agreement.startDate) : undefined,
      endDate: agreement.endDate ? new Date(agreement.endDate) : undefined,
      duration: agreement.duration ? parseInt(agreement.duration, 10) : undefined,
      durationUnit: agreement.durationUnit,
      numberOfRevisions: agreement.numberOfRevisions,
      jurisdiction: agreement.jurisdiction,
      status: agreement.status,
      deliverables: deliverablesResult.rows,
      paymentTerms,
      signatures: signaturesResult.rows.map((s) => ({
        id: s.id,
        signerType: s.signerType,
        clientId: s.clientId,
        signerName: s.signerName,
        signatureImageName: s.signatureImageName,
        signatureImagePath: s.signatureImagePath,
        timestamp: new Date(s.timestamp),
      })),
      createdAt: new Date(agreement.createdAt),
      updatedAt: new Date(agreement.updatedAt),
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error fetching agreement:', error);
    throw new AppError('Failed to fetch agreement', 500);
  } finally {
    client.release();
  }
};

/**
 * Get agreement by project ID
 */
export const getAgreementByProjectId = async (
  projectId: number,
  userId: number
): Promise<AgreementResponse | null> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT id FROM agreements WHERE "projectId" = $1 AND "userId" = $2`,
      [projectId, userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return await getAgreementById(result.rows[0].id, userId);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error fetching agreement by project:', error);
    throw new AppError('Failed to fetch agreement', 500);
  } finally {
    client.release();
  }
};

/**
 * Update agreement (editable within 2 days)
 */
export const updateAgreement = async (
  agreementId: number,
  userId: number,
  updateData: Partial<AgreementCreateData>
): Promise<AgreementResponse> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if agreement exists and is editable (within 2 days)
    const agreementCheck = await client.query(
      `SELECT id, "createdAt" FROM agreements WHERE id = $1 AND "userId" = $2`,
      [agreementId, userId]
    );

    if (agreementCheck.rows.length === 0) {
      throw new AppError('Agreement not found', 404);
    }

    const createdAt = new Date(agreementCheck.rows[0].createdAt);
    const now = new Date();
    const daysSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceCreation > 2) {
      throw new AppError('Agreement can only be edited within 2 days of creation', 400);
    }

    // Update main agreement fields
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updateData.serviceProviderName !== undefined) {
      updateFields.push(`"serviceProviderName" = $${paramIndex}`);
      values.push(updateData.serviceProviderName);
      paramIndex++;
    }
    if (updateData.agreementDate !== undefined) {
      updateFields.push(`"agreementDate" = $${paramIndex}`);
      values.push(updateData.agreementDate);
      paramIndex++;
    }
    if (updateData.serviceType !== undefined) {
      updateFields.push(`"serviceType" = $${paramIndex}`);
      values.push(updateData.serviceType);
      paramIndex++;
    }
    if (updateData.startDate !== undefined) {
      updateFields.push(`"startDate" = $${paramIndex}`);
      values.push(updateData.startDate || null);
      paramIndex++;
    }
    if (updateData.endDate !== undefined) {
      updateFields.push(`"endDate" = $${paramIndex}`);
      values.push(updateData.endDate || null);
      paramIndex++;
    }
    if (updateData.duration !== undefined) {
      updateFields.push(`duration = $${paramIndex}`);
      values.push(updateData.duration || null);
      paramIndex++;
    }
    if (updateData.durationUnit !== undefined) {
      updateFields.push(`"durationUnit" = $${paramIndex}`);
      values.push(updateData.durationUnit || null);
      paramIndex++;
    }
    if (updateData.numberOfRevisions !== undefined) {
      updateFields.push(`"numberOfRevisions" = $${paramIndex}`);
      values.push(updateData.numberOfRevisions);
      paramIndex++;
    }
    if (updateData.jurisdiction !== undefined) {
      updateFields.push(`jurisdiction = $${paramIndex}`);
      values.push(updateData.jurisdiction || null);
      paramIndex++;
    }

    if (updateFields.length > 0) {
      values.push(agreementId);
      await client.query(
        `UPDATE agreements SET ${updateFields.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $${paramIndex}`,
        values
      );
    }

    // Update deliverables if provided
    if (updateData.deliverables !== undefined) {
      // Delete existing deliverables
      await client.query(
        `DELETE FROM agreement_deliverables WHERE "agreementId" = $1`,
        [agreementId]
      );

      // Insert new deliverables
      for (let i = 0; i < updateData.deliverables.length; i++) {
        await client.query(
          `INSERT INTO agreement_deliverables ("agreementId", description, "order", "createdAt")
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
          [agreementId, updateData.deliverables[i], i]
        );
      }
    }

    // Update payment terms if provided
    if (updateData.paymentStructure !== undefined) {
      // Delete existing payment terms (cascades to milestones)
      await client.query(
        `DELETE FROM agreement_payment_terms WHERE "agreementId" = $1`,
        [agreementId]
      );

      // Insert new payment terms
      const paymentTermResult = await client.query(
        `INSERT INTO agreement_payment_terms ("agreementId", "paymentStructure", "paymentMethod", "createdAt")
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         RETURNING id`,
        [
          agreementId,
          updateData.paymentStructure,
          updateData.paymentMethod || null,
        ]
      );

      const paymentTermId = paymentTermResult.rows[0].id;

      // Insert milestones if milestone-based
      if (
        updateData.paymentStructure === 'milestone-based' &&
        updateData.paymentMilestones &&
        updateData.paymentMilestones.length > 0
      ) {
        for (let i = 0; i < updateData.paymentMilestones.length; i++) {
          await client.query(
            `INSERT INTO agreement_payment_milestones 
             ("agreementPaymentTermId", description, amount, "order", "milestoneDate", "createdAt")
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
            [
              paymentTermId,
              updateData.paymentMilestones[i].description,
              updateData.paymentMilestones[i].amount,
              i,
              updateData.paymentMilestones[i].date || null,
            ]
          );
        }
      }
    }

    await client.query('COMMIT');

    return await getAgreementById(agreementId, userId);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error updating agreement:', error);
    throw new AppError('Failed to update agreement', 500);
  } finally {
    client.release();
  }
};

/**
 * Delete agreement
 */
export const deleteAgreement = async (
  agreementId: number,
  userId: number
): Promise<void> => {
  const client = await pool.connect();

  try {
    // Verify agreement exists and belongs to user
    const agreementCheck = await client.query(
      'SELECT id FROM agreements WHERE id = $1 AND "userId" = $2',
      [agreementId, userId]
    );

    if (agreementCheck.rows.length === 0) {
      throw new AppError('Agreement not found', 404);
    }

    // Get signature paths before deletion
    const signaturesResult = await client.query(
      `SELECT "signatureImagePath" FROM agreement_signatures WHERE "agreementId" = $1`,
      [agreementId]
    );

    // Delete agreement (cascades to related tables)
    await client.query('DELETE FROM agreements WHERE id = $1', [agreementId]);

    // Delete signature files from blob storage
    for (const sig of signaturesResult.rows) {
      try {
        await BlobStorageService.deleteFile(sig.signatureImagePath);
      } catch (error) {
        console.error('Error deleting signature file:', error);
        // Continue even if file deletion fails
      }
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error deleting agreement:', error);
    throw new AppError('Failed to delete agreement', 500);
  } finally {
    client.release();
  }
};

/**
 * Validate signature token and check expiration
 */
export const validateSignatureToken = async (
  token: string
): Promise<{
  valid: boolean;
  link?: any;
  agreement?: AgreementResponse;
  expired?: boolean;
}> => {
  const client = await pool.connect();

  try {
    const linkResult = await client.query(
      `SELECT acl.*, a."userId"
       FROM agreement_client_links acl
       INNER JOIN agreements a ON acl."agreementId" = a.id
       WHERE acl.token = $1`,
      [token]
    );

    if (linkResult.rows.length === 0) {
      return { valid: false };
    }

    const link = linkResult.rows[0];
    const expiresAt = new Date(link.expiresAt);
    const now = new Date();

    if (now > expiresAt) {
      // Update status to expired if not already
      if (link.status !== 'expired') {
        await client.query(
          `UPDATE agreement_client_links SET status = 'expired' WHERE id = $1`,
          [link.id]
        );
      }
      return { valid: false, expired: true };
    }

    // Get agreement - handle case where agreement might not exist
    let agreement: AgreementResponse;
    try {
      agreement = await getAgreementById(link.agreementId, link.userId);
    } catch (error) {
      console.error('Error fetching agreement in validateSignatureToken:', error);
      // If agreement not found, still return invalid
      return { valid: false };
    }

    // Get client information
    const clientInfoResult = await client.query(
      `SELECT "fullName", organization FROM master_clients WHERE id = $1`,
      [link.clientId]
    );
    const clientInfo = clientInfoResult.rows[0] || null;

    return {
      valid: true,
      link: {
        ...link,
        clientName: clientInfo?.fullName || null,
        clientOrganization: clientInfo?.organization || null,
      },
      agreement,
      expired: false,
    };
  } catch (error) {
    console.error('Error validating token:', error);
    return { valid: false };
  } finally {
    client.release();
  }
};

/**
 * Generate PDF of signed agreement
 */
export const generateAgreementPdf = async (
  agreementId: number,
  userId: number
): Promise<Buffer> => {
  return new Promise(async (resolve, reject) => {
    try {
      // Get full agreement data
      const agreement = await getAgreementById(agreementId, userId);
      
      // Get client information
      const client = await pool.connect();
      let clientInfo: any = null;
      if (agreement.signatures.some(s => s.signerType === 'client' && s.clientId)) {
        const clientSig = agreement.signatures.find(s => s.signerType === 'client');
        if (clientSig?.clientId) {
          const clientResult = await client.query(
            `SELECT "fullName", organization FROM master_clients WHERE id = $1`,
            [clientSig.clientId]
          );
          clientInfo = clientResult.rows[0] || null;
        }
      }
      client.release();

      const MARGIN = 50;
      const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);

      const pageWidth = doc.page.width - (MARGIN * 2);
      const lineHeight = 20;
      let yPosition = MARGIN;

      // Helper function to add text with wrapping
      const addText = (text: string, fontSize: number = 12, isBold: boolean = false, align: 'left' | 'center' | 'right' = 'left') => {
        doc.fontSize(fontSize);
        if (isBold) {
          doc.font('Helvetica-Bold');
        } else {
          doc.font('Helvetica');
        }
        const options: any = { width: pageWidth, align };
        const lines = doc.heightOfString(text, options);
        if (yPosition + lines > doc.page.height - MARGIN) {
          doc.addPage();
          yPosition = MARGIN;
        }
        doc.text(text, MARGIN, yPosition, options);
        yPosition += lines + 10;
      };

      // Title
      addText('SERVICE AGREEMENT', 18, true, 'center');
      yPosition += 10;

      // Introduction
      const agreementDate = new Date(agreement.agreementDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      addText(
        `This Agreement is entered into between ${agreement.serviceProviderName} ("Service Provider") and ${clientInfo?.fullName || '[Client Name]'} ("Client") on ${agreementDate}.`,
        12,
        false
      );
      yPosition += 20;
      doc.moveTo(MARGIN, yPosition).lineTo(doc.page.width - MARGIN, yPosition).stroke();
      yPosition += 20;

      // 1. Scope of Work
      addText('1. Scope of Work', 14, true);
      addText('The Service Provider agrees to design and/or develop a website as per the following scope:', 12);
      addText(`Service Type:`, 12, true);
      addText(agreement.serviceType, 12);
      if (agreement.deliverables.length > 0) {
        addText('Deliverables Include:', 12, true);
        agreement.deliverables.forEach(d => {
          addText(`• ${d.description}`, 12);
        });
      }
      addText(
        'Any additional features, integrations, or changes not explicitly listed above are outside the scope of this Agreement and may require a separate quotation or amendment.',
        11,
        false
      );
      yPosition += 10;
      doc.moveTo(MARGIN, yPosition).lineTo(doc.page.width - MARGIN, yPosition).stroke();
      yPosition += 20;

      // 2. Timeline & Milestones
      addText('2. Timeline & Milestones', 14, true);
      if (agreement.startDate) {
        const startDate = new Date(agreement.startDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        addText(`• Project Start Date: ${startDate}`, 12);
      }
      if (agreement.endDate) {
        const endDate = new Date(agreement.endDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        addText(`• Estimated Completion Date: ${endDate}`, 12);
      }
      if (agreement.duration) {
        const unit = agreement.durationUnit === 'weeks' ? 'Weeks' :
                     agreement.durationUnit === 'months' ? 'Months' : 'Days';
        addText(`• Total Duration: ${agreement.duration} ${unit}`, 12);
      }
      addText(
        'Timelines are dependent on timely feedback, approvals, and content provided by the Client. Delays caused by the Client may extend the project timeline accordingly.',
        11,
        false
      );
      yPosition += 10;
      doc.moveTo(MARGIN, yPosition).lineTo(doc.page.width - MARGIN, yPosition).stroke();
      yPosition += 20;

      // 3. Payment Terms
      addText('3. Payment Terms', 14, true);
      addText('The Client agrees to pay the Service Provider as per the selected payment structure:', 12);
      const paymentStructureText = agreement.paymentTerms.paymentStructure === '50-50' 
        ? '☑ 50% Upfront & 50% Upon Completion'
        : agreement.paymentTerms.paymentStructure === '100-upfront'
        ? '☑ 100% Upfront'
        : agreement.paymentTerms.paymentStructure === '100-completion'
        ? '☑ 100% Upon Completion'
        : '☑ Milestone-Based Payments';
      addText(paymentStructureText, 12, true);
      if (agreement.paymentTerms.paymentStructure === 'milestone-based' && agreement.paymentTerms.milestones) {
        agreement.paymentTerms.milestones.forEach(m => {
          const dateText = m.date ? ` (Due: ${new Date(m.date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })})` : '';
          addText(`• ${m.description} – ${new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
          }).format(m.amount)}${dateText}`, 12);
        });
      }
      if (agreement.paymentTerms.paymentMethod) {
        addText(`Payments must be made via: ${agreement.paymentTerms.paymentMethod}`, 12);
      }
      addText(
        'Work will commence only after receipt of any applicable upfront payment. Late payments may result in work being paused until payment is received.',
        11,
        false
      );
      yPosition += 10;
      doc.moveTo(MARGIN, yPosition).lineTo(doc.page.width - MARGIN, yPosition).stroke();
      yPosition += 20;

      // 4. Revisions
      addText('4. Revisions', 14, true);
      addText(`The Agreement includes up to ${agreement.numberOfRevisions} revisions.`, 12);
      addText(
        'A "revision" refers to minor design or content adjustments within the agreed scope. Major changes, redesigns, or scope expansions will be treated as additional work and billed separately.',
        11,
        false
      );
      yPosition += 10;
      doc.moveTo(MARGIN, yPosition).lineTo(doc.page.width - MARGIN, yPosition).stroke();
      yPosition += 20;

      // 5. Client Responsibilities
      addText('5. Client Responsibilities', 14, true);
      addText('The Client agrees to:', 12);
      addText('• Provide all required content, assets, and feedback in a timely manner', 12);
      addText('• Review and approve deliverables within a reasonable timeframe', 12);
      addText('• Ensure that any provided content does not infringe third-party rights', 12);
      addText('Delays in client input may affect delivery timelines.', 11, false);
      yPosition += 10;
      doc.moveTo(MARGIN, yPosition).lineTo(doc.page.width - MARGIN, yPosition).stroke();
      yPosition += 20;

      // 6. Ownership & Usage Rights
      addText('6. Ownership & Usage Rights', 14, true);
      addText('Upon full payment, the Client will receive ownership rights to the final approved deliverables.', 12);
      addText(
        'The Service Provider retains the right to showcase the work in portfolios, case studies, or marketing materials unless otherwise agreed in writing.',
        11,
        false
      );
      yPosition += 10;
      doc.moveTo(MARGIN, yPosition).lineTo(doc.page.width - MARGIN, yPosition).stroke();
      yPosition += 20;

      // 7. Confidentiality
      addText('7. Confidentiality', 14, true);
      addText(
        'Both parties agree to keep any confidential or sensitive information shared during the project strictly confidential and not disclose it to third parties without prior consent.',
        11,
        false
      );
      yPosition += 10;
      doc.moveTo(MARGIN, yPosition).lineTo(doc.page.width - MARGIN, yPosition).stroke();
      yPosition += 20;

      // 8. Termination
      addText('8. Termination', 14, true);
      addText('Either party may terminate this Agreement with written notice.', 12);
      addText('• Payments already made are non-refundable for work completed up to the termination date.', 12);
      addText('• Any completed work up to termination will be handed over to the Client upon settlement of dues.', 12);
      yPosition += 10;
      doc.moveTo(MARGIN, yPosition).lineTo(doc.page.width - MARGIN, yPosition).stroke();
      yPosition += 20;

      // 9. Limitation of Liability
      addText('9. Limitation of Liability', 14, true);
      addText('The Service Provider shall not be liable for:', 12);
      addText('• Loss of business, revenue, or profits', 12);
      addText('• Issues arising from third-party tools, hosting providers, or platforms', 12);
      addText('• Delays caused by client actions or external dependencies', 12);
      yPosition += 10;
      doc.moveTo(MARGIN, yPosition).lineTo(doc.page.width - MARGIN, yPosition).stroke();
      yPosition += 20;

      // 10. Governing Law
      addText('10. Governing Law', 14, true);
      addText(
        `This Agreement shall be governed by and interpreted in accordance with the laws applicable in ${agreement.jurisdiction || '[Jurisdiction / Country]'}, unless otherwise agreed.`,
        11,
        false
      );
      yPosition += 10;
      doc.moveTo(MARGIN, yPosition).lineTo(doc.page.width - MARGIN, yPosition).stroke();
      yPosition += 20;

      // 11. Acceptance & E-Signature
      addText('11. Acceptance & E-Signature', 14, true);
      addText(
        'By proceeding, both parties confirm that they have read, understood, and agreed to the terms of this Agreement.',
        11,
        false
      );
      yPosition += 20;

      // Client Signature
      addText('Client Signature:', 12, true);
      const clientSignature = agreement.signatures.find(s => s.signerType === 'client');
      if (clientSignature) {
        try {
          // Download signature image from blob storage
          const sigFile = await BlobStorageService.downloadFile(clientSignature.signatureImagePath);
          const sigImageBuffer = sigFile.buffer;
          
          // Embed signature image in PDF (max width 150mm, maintain aspect ratio)
          const maxWidth = 150;
          const imageHeight = (sigImageBuffer.length > 0) ? maxWidth * 0.3 : 30; // Approximate height
          
          if (yPosition + imageHeight + 40 > doc.page.height - MARGIN) {
            doc.addPage();
            yPosition = MARGIN;
          }
          
          doc.image(sigImageBuffer, MARGIN, yPosition, { width: maxWidth, fit: [maxWidth, 100] });
          yPosition += imageHeight + 10;
          
          addText(`Signed by: ${clientSignature.signerName}`, 11);
          addText(`Date: ${new Date(clientSignature.timestamp).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}`, 11);
        } catch (error) {
          console.error('Error loading client signature:', error);
          addText(`Signed by: ${clientSignature.signerName}`, 11);
          addText(`Date: ${new Date(clientSignature.timestamp).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}`, 11);
        }
      } else {
        addText('________', 12);
        addText('Date: ________', 12);
      }
      yPosition += 20;

      // Service Provider Signature
      addText('Service Provider Signature:', 12, true);
      const serviceProviderSig = agreement.signatures.find(s => s.signerType === 'service_provider');
      if (serviceProviderSig) {
        try {
          // Download signature image from blob storage
          const sigFile = await BlobStorageService.downloadFile(serviceProviderSig.signatureImagePath);
          const sigImageBuffer = sigFile.buffer;
          
          // Embed signature image in PDF (max width 150mm, maintain aspect ratio)
          const maxWidth = 150;
          const imageHeight = (sigImageBuffer.length > 0) ? maxWidth * 0.3 : 30; // Approximate height
          
          if (yPosition + imageHeight + 40 > doc.page.height - MARGIN) {
            doc.addPage();
            yPosition = MARGIN;
          }
          
          doc.image(sigImageBuffer, MARGIN, yPosition, { width: maxWidth, fit: [maxWidth, 100] });
          yPosition += imageHeight + 10;
          
          addText(`Signed by: ${serviceProviderSig.signerName}`, 11);
          addText(`Date: ${new Date(serviceProviderSig.timestamp).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}`, 11);
        } catch (error) {
          console.error('Error loading service provider signature:', error);
          addText(`Signed by: ${serviceProviderSig.signerName}`, 11);
          addText(`Date: ${new Date(serviceProviderSig.timestamp).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}`, 11);
        }
      } else {
        addText('________', 12);
        addText('Date: ________', 12);
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Submit client signature
 */
export const submitClientSignature = async (
  token: string,
  signatureData: {
    signerName: string;
    signatureImage: string; // base64
  },
  ipAddress?: string
): Promise<{ pdfUrl?: string }> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Validate token
    const validation = await validateSignatureToken(token);
    if (!validation.valid || !validation.link || !validation.agreement) {
      throw new AppError('Invalid or expired token', 400);
    }

    if (validation.expired) {
      throw new AppError('Signature link has expired', 400);
    }

    const link = validation.link;
    const agreement = validation.agreement;

    // Check if already signed
    if (link.status === 'client_signed') {
      throw new AppError('Agreement has already been signed by this client', 400);
    }

    // Upload signature image
    const timestamp = Date.now();
    const fileName = `signature-client-${link.clientId}-${timestamp}.png`;
    const base64Data = signatureData.signatureImage.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    const blobPath = await BlobStorageService.uploadFile(
      imageBuffer,
      fileName,
      FileType.SIGNATURES,
      agreement.projectId,
      'image/png'
    );

    // Generate document ID
    const documentId = `AGREEMENT-${agreement.id}-CLIENT-${link.clientId}-${timestamp}`;

    // Insert signature
    await client.query(
      `INSERT INTO agreement_signatures (
        "agreementId", "signerType", "clientId", "signerName", "signatureImageName",
        "signatureImagePath", "ipAddress", timestamp, "documentId", "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8, CURRENT_TIMESTAMP)`,
      [
        agreement.id,
        'client',
        link.clientId,
        signatureData.signerName,
        fileName,
        blobPath,
        ipAddress || null,
        documentId,
      ]
    );

    // Update link status
    await client.query(
      `UPDATE agreement_client_links 
       SET status = 'client_signed', "signedAt" = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [link.id]
    );

    // Check if all clients have signed, update agreement status
    const pendingLinks = await client.query(
      `SELECT COUNT(*) as count FROM agreement_client_links 
       WHERE "agreementId" = $1 AND status = 'pending'`,
      [agreement.id]
    );

    if (parseInt(pendingLinks.rows[0].count, 10) === 0) {
      await client.query(
        `UPDATE agreements SET status = 'completed' WHERE id = $1`,
        [agreement.id]
      );
    } else {
      await client.query(
        `UPDATE agreements SET status = 'pending' WHERE id = $1`,
        [agreement.id]
      );
    }

    await client.query('COMMIT');

    // Generate PDF of signed agreement and send emails (outside transaction)
    let pdfUrl: string | undefined;
    try {
      // Reload agreement to get updated signatures
      const updatedAgreement = await getAgreementById(agreement.id, agreement.userId);
      const pdfBuffer = await generateAgreementPdf(agreement.id, agreement.userId);
      
      // Upload PDF to blob storage
      const pdfFileName = `Agreement-${agreement.id}-Signed-${timestamp}.pdf`;
      const pdfBlobPath = await BlobStorageService.uploadFile(
        pdfBuffer,
        pdfFileName,
        FileType.SIGNATURES,
        agreement.projectId,
        'application/pdf'
      );

      // Get download URL for client (7 days validity)
      pdfUrl = await BlobStorageService.getDownloadUrl(pdfBlobPath, 60 * 24 * 7);

      // Get user and client information for emails
      const userResult = await client.query(
        `SELECT "fullName", email FROM users WHERE id = $1`,
        [agreement.userId]
      );
      const user = userResult.rows[0];

      const clientResult = await client.query(
        `SELECT "fullName", email FROM master_clients WHERE id = $1`,
        [link.clientId]
      );
      const clientData = clientResult.rows[0];

      // Get project name
      const projectResult = await client.query(
        `SELECT name FROM projects WHERE id = $1`,
        [agreement.projectId]
      );
      const projectName = projectResult.rows[0]?.name;

      // Send PDF to client via email
      if (clientData?.email) {
        try {
          const clientEmailTemplate = {
            subject: `Signed Agreement - ${projectName || 'Service Agreement'}`,
            html: `
              <p>Dear ${clientData.fullName},</p>
              <p>Thank you for signing the service agreement.</p>
              <p>Please find attached a copy of the fully signed agreement for your records.</p>
              <p>If you have any questions, please feel free to reach out.</p>
              <p>Best regards,<br/>${user.fullName}</p>
            `,
            text: `Dear ${clientData.fullName},\n\nThank you for signing the service agreement.\n\nPlease find attached a copy of the fully signed agreement for your records.\n\nIf you have any questions, please feel free to reach out.\n\nBest regards,\n${user.fullName}`,
          };

          await sendMail({
            to: clientData.email,
            subject: clientEmailTemplate.subject,
            html: clientEmailTemplate.html,
            text: clientEmailTemplate.text,
            attachments: [
              {
                filename: pdfFileName,
                content: pdfBuffer,
              } as any,
            ],
          });
          console.log(`[submitClientSignature] PDF sent to client: ${clientData.email}`);
        } catch (emailError) {
          console.error('[submitClientSignature] Error sending PDF to client:', emailError);
          // Don't fail the signature submission if email fails
        }
      }

      // Send PDF to service provider via email
      if (user?.email) {
        try {
          const providerEmailTemplate = {
            subject: `Agreement Signed - ${clientData?.fullName || 'Client'} - ${projectName || 'Service Agreement'}`,
            html: `
              <p>Dear ${user.fullName},</p>
              <p>The service agreement has been signed by ${clientData?.fullName || 'the client'}.</p>
              <p>Please find attached a copy of the fully signed agreement.</p>
              <p><strong>Client Details:</strong></p>
              <ul>
                <li>Name: ${clientData?.fullName || 'N/A'}</li>
                <li>Signed Date: ${new Date().toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}</li>
              </ul>
              <p>Best regards,<br/>Mudhro System</p>
            `,
            text: `Dear ${user.fullName},\n\nThe service agreement has been signed by ${clientData?.fullName || 'the client'}.\n\nPlease find attached a copy of the fully signed agreement.\n\nClient Details:\n- Name: ${clientData?.fullName || 'N/A'}\n- Signed Date: ${new Date().toLocaleDateString()}\n\nBest regards,\nMudhro System`,
          };

          await sendMail({
            to: user.email,
            subject: providerEmailTemplate.subject,
            html: providerEmailTemplate.html,
            text: providerEmailTemplate.text,
            attachments: [
              {
                filename: pdfFileName,
                content: pdfBuffer,
              } as any,
            ],
          });
          console.log(`[submitClientSignature] PDF sent to service provider: ${user.email}`);
        } catch (emailError) {
          console.error('[submitClientSignature] Error sending PDF to service provider:', emailError);
          // Don't fail the signature submission if email fails
        }
      }
    } catch (pdfError) {
      console.error('[submitClientSignature] Error generating PDF:', pdfError);
      // Don't fail the signature submission if PDF generation fails
    }

    return { pdfUrl };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error submitting client signature:', error);
    throw new AppError('Failed to submit signature', 500);
  } finally {
    client.release();
  }
};

/**
 * Send agreement to clients
 */
export const sendAgreementToClients = async (
  agreementId: number,
  userId: number,
  clientIds: number[],
  baseUrl: string
): Promise<void> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get agreement
    const agreement = await getAgreementById(agreementId, userId);

    // Get user info for email
    const userResult = await client.query(
      `SELECT "fullName", email, "mobileNumber" FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    const user = userResult.rows[0];

    // Get project name
    const projectResult = await client.query(
      `SELECT name FROM projects WHERE id = $1`,
      [agreement.projectId]
    );
    const projectName = projectResult.rows[0]?.name;

    // Get clients
    const clientsResult = await client.query(
      `SELECT id, "fullName", email FROM master_clients 
       WHERE id = ANY($1::int[]) AND "userId" = $2`,
      [clientIds, userId]
    );

    if (clientsResult.rows.length === 0) {
      throw new AppError('No valid clients found', 400);
    }

    // Create links and send emails
    for (const clientRow of clientsResult.rows) {
      // Check if link already exists
      const existingLink = await client.query(
        `SELECT id FROM agreement_client_links 
         WHERE "agreementId" = $1 AND "clientId" = $2`,
        [agreementId, clientRow.id]
      );

      let linkId: number;
      let token: string;

      if (existingLink.rows.length > 0) {
        // Update existing link
        token = generateClientSignatureToken();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 2); // 2 days from now

        await client.query(
          `UPDATE agreement_client_links 
           SET token = $1, "expiresAt" = $2, status = 'pending', "emailSentAt" = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [token, expiresAt, existingLink.rows[0].id]
        );
        linkId = existingLink.rows[0].id;
      } else {
        // Create new link
        token = generateClientSignatureToken();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 2); // 2 days from now

        const linkResult = await client.query(
          `INSERT INTO agreement_client_links 
           ("agreementId", "clientId", token, "expiresAt", status, "emailSentAt", "createdAt")
           VALUES ($1, $2, $3, $4, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           RETURNING id`,
          [agreementId, clientRow.id, token, expiresAt]
        );
        linkId = linkResult.rows[0].id;
      }

      // Generate signature link
      const agreementLink = `${baseUrl}/agreement/sign/${token}`;

      // Send email
      if (clientRow.email) {
        try {
          const emailTemplate = buildAgreementEmail({
            clientFullName: clientRow.fullName,
            userFullName: user.fullName,
            userPhone: user.mobileNumber,
            userEmail: user.email,
            agreementLink,
            projectName,
          });

          await sendMail({
            to: clientRow.email,
            subject: emailTemplate.subject,
            html: emailTemplate.html,
            text: emailTemplate.text,
          });
        } catch (emailError) {
          console.error(`Failed to send email to ${clientRow.email}:`, emailError);
          // Continue with other clients even if one email fails
        }
      }
    }

    // Update agreement status to pending
    await client.query(
      `UPDATE agreements SET status = 'pending' WHERE id = $1`,
      [agreementId]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error sending agreement to clients:', error);
    throw new AppError('Failed to send agreement to clients', 500);
  } finally {
    client.release();
  }
};
