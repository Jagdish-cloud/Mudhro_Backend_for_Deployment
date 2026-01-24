interface BaseTemplateParams {
  clientFullName: string;
  amount: number;
  currency?: string;
  userFullName: string;
  userPhone?: string | null;
  userEmail: string;
}

interface InvoiceEmailTemplateParams extends BaseTemplateParams {}

interface ReminderEmailTemplateParams extends BaseTemplateParams {
  invoiceNumber: string;
  dateSent: Date;
}

interface UpdateEmailTemplateParams extends BaseTemplateParams {
  invoiceNumber: string;
}

const formatCurrency = (amount: number, currency: string = 'INR'): string => {
  // Determine locale based on currency
  const localeMap: { [key: string]: string } = {
    'USD': 'en-US',
    'INR': 'en-IN',
    'EUR': 'en-GB',
    'GBP': 'en-GB',
  };
  const locale = localeMap[currency] || 'en-IN';
  
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

const buildSignature = (userFullName: string, userPhone: string | null | undefined, userEmail: string): string => {
  const lines = [
    'Warm regards,',
    '',
    userFullName,
  ];

  if (userPhone) {
    lines.push(`📞 ${userPhone}`);
  }

  lines.push(`📧 ${userEmail}`);

  return lines.join('\n');
};

export const buildInvoiceEmail = ({
  clientFullName,
  amount,
  currency,
  userFullName,
  userPhone,
  userEmail,
}: InvoiceEmailTemplateParams): { subject: string; text: string; html: string } => {
  const amountFormatted = formatCurrency(amount, currency);
  const signature = buildSignature(userFullName, userPhone, userEmail);

  const subject = `Invoice for ${clientFullName} - ${amountFormatted}`;

  const lines = [
    `Hi ${clientFullName},`,
    'Hope you’re doing well.',
    'Please find attached the invoice (PDF) for the work completed.',
    `The total payable amount is ${amountFormatted}.`,
    'Kindly confirm once the payment is processed.',
    'Thank you for the opportunity — I truly appreciate your trust and look forward to working together again.',
    signature,
  ];

  const text = lines.join('\n');

  const html = `
    <p>Hi ${clientFullName},</p>
    <p>Hope you’re doing well.</p>
    <p>Please find attached the invoice (PDF) for the work completed.</p>
    <p>The total payable amount is <strong>${amountFormatted}</strong>.</p>
    <p>Kindly confirm once the payment is processed.</p>
    <p>Thank you for the opportunity — I truly appreciate your trust and look forward to working together again.</p>
    <p>${signature.replace(/\n/g, '<br/>')}</p>
  `;

  return { subject, text, html };
};

export const buildReminderEmail = ({
  clientFullName,
  amount,
  currency,
  userFullName,
  userPhone,
  userEmail,
  invoiceNumber,
  dateSent,
}: ReminderEmailTemplateParams): { subject: string; text: string; html: string } => {
  const amountFormatted = formatCurrency(amount, currency);
  const signature = buildSignature(userFullName, userPhone, userEmail);
  const clientFirstName = clientFullName.trim().split(' ')[0] || clientFullName;
  const formattedDate = dateSent.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const subject = `Gentle reminder: Invoice #${invoiceNumber}`;

  const lines = [
    `Hi ${clientFirstName},`,
    '',
    'Hope you’ve been doing well.',
    '',
    `This is a gentle reminder regarding Invoice #${invoiceNumber} for ${amountFormatted}, which was shared on ${formattedDate}.`,
    '',
    'Please let me know once the payment is processed — or if you need me to resend the invoice for convenience.',
    '',
    'Thank you for your time and for the continued trust in my work.',
    '',
    signature,
  ];

  const text = lines.join('\n');

  const html = `
    <p>Hi ${clientFirstName},</p>
    <p>I hope you’ve been doing well.</p>
    <p>This is a gentle reminder regarding Invoice #${invoiceNumber} for <strong>${amountFormatted}</strong>, which was shared on ${formattedDate}.</p>
    <p>Please let me know once the payment has been processed — or if you need me to resend the invoice for convenience.</p>
    <p>Thank you for your time and for the continued trust in my work.</p>
    <p>${signature.replace(/\n/g, '<br/>')}</p>
  `;

  return { subject, text, html };
};

export const buildInvoiceUpdateEmail = ({
  clientFullName,
  amount,
  currency,
  userFullName,
  userPhone,
  userEmail,
  invoiceNumber,
}: UpdateEmailTemplateParams): { subject: string; text: string; html: string } => {
  const amountFormatted = formatCurrency(amount, currency);
  const signature = buildSignature(userFullName, userPhone, userEmail);
  const clientFirstName = clientFullName.trim().split(' ')[0] || clientFullName;

  const subject = `Payment Update Request – Invoice #${invoiceNumber}`;

  const lines = [
    `Hi ${clientFirstName},`,
    "Hope you're doing well.",
    'I wanted to kindly check regarding the invoice which ws shared earlier for the work completed.',
    `The total payable amount is ${amountFormatted}. Can you please confirm the status of the payment ?`,
    'If anything is needed from my end (revised copy, additional details, etc.), please feel free to contact.',
    'Thanks and Regards.',
    signature,
  ];

  const text = lines.join('\n');

  const html = `
    <p>Hi ${clientFirstName},</p>
    <p>Hope you're doing well.</p>
    <p>I wanted to kindly check in regarding the invoice I shared earlier for the work completed.</p>
    <p>The total payable amount is <strong>${amountFormatted}</strong>. Can you please confirm the status of the payment when convenient?</p>
    <p>If anything is needed from my end (revised copy, additional details, etc.), please feel free to let me know.</p>
    <p>Thank you again — I appreciate your time and support.</p>
    <p>${signature.replace(/\n/g, '<br/>')}</p>
  `;

  return { subject, text, html };
};

interface AgreementEmailTemplateParams {
  clientFullName: string;
  userFullName: string;
  userPhone?: string | null;
  userEmail: string;
  agreementLink: string;
  projectName?: string;
}

export const buildAgreementEmail = ({
  clientFullName,
  userFullName,
  userPhone,
  userEmail,
  agreementLink,
  projectName,
}: AgreementEmailTemplateParams): { subject: string; text: string; html: string } => {
  const signature = buildSignature(userFullName, userPhone, userEmail);
  const clientFirstName = clientFullName.trim().split(' ')[0] || clientFullName;
  const projectText = projectName ? ` for the project "${projectName}"` : '';

  const subject = `Service Agreement${projectName ? ` - ${projectName}` : ''} - Action Required`;

  const lines = [
    `Hi ${clientFirstName},`,
    '',
    "Hope you're doing well.",
    '',
    `I'm reaching out to share the service agreement${projectText} for your review and signature.`,
    '',
    'Please review the agreement details and sign using the link below:',
    '',
    agreementLink,
    '',
    'Important: This link will expire in 2 days (48 hours) from the time this email was sent.',
    '',
    'If you have any questions or need any clarifications, please feel free to reach out to me.',
    '',
    'Thank you for your time and I look forward to working with you.',
    '',
    signature,
  ];

  const text = lines.join('\n');

  const html = `
    <p>Hi ${clientFirstName},</p>
    <p>Hope you're doing well.</p>
    <p>I'm reaching out to share the service agreement${projectText} for your review and signature.</p>
    <p>Please review the agreement details and sign using the link below:</p>
    <p style="margin: 20px 0;">
      <a href="${agreementLink}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
        Sign Agreement
      </a>
    </p>
    <p style="color:rgb(249, 211, 72); font-weight: bold;">Important: This link will expire in 2 days (48 hours) from the time this email was sent.</p>
    <p>If you have any questions or need any clarifications, please feel free to reach out to me.</p>
    <p>Thank you for your time and I look forward to working with you.</p>
    <p>${signature.replace(/\n/g, '<br/>')}</p>
  `;

  return { subject, text, html };
};


