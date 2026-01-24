import nodemailer, { SendMailOptions, Transporter } from 'nodemailer';

const gmailUser = process.env.GMAIL_USER;
const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

if (!gmailUser || !gmailAppPassword) {
  console.warn('[mailer] Gmail credentials are not fully configured. Email features will be disabled.');
  console.warn('[mailer] GMAIL_USER:', gmailUser ? 'Set' : 'NOT SET');
  console.warn('[mailer] GMAIL_APP_PASSWORD:', gmailAppPassword ? 'Set' : 'NOT SET');
}

let transporter: Transporter | null = null;

if (gmailUser && gmailAppPassword) {
  try {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    });

    // Verify transporter configuration (async, don't block startup)
    (transporter as any).verify()
      .then(() => {
        console.log('[mailer] ✅ Email transporter verified and ready');
      })
      .catch((error: any) => {
        console.error('[mailer] Transporter verification failed:', error);
      });
  } catch (error) {
    console.error('[mailer] Failed to create transporter:', error);
  }
}

export interface MailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: SendMailOptions['attachments'];
}

export const sendMail = async (params: MailParams): Promise<void> => {
  console.log('[mailer] Attempting to send email...');
  console.log('[mailer] To:', params.to);
  console.log('[mailer] Subject:', params.subject);
  console.log('[mailer] Has attachments:', params.attachments ? params.attachments.length : 0);

  if (!gmailUser || !gmailAppPassword) {
    const errorMsg = 'Email service not configured. Please set GMAIL_USER and GMAIL_APP_PASSWORD environment variables.';
    console.error('[mailer] ❌', errorMsg);
    throw new Error(errorMsg);
  }

  if (!transporter) {
    const errorMsg = 'Email transporter not initialized. Check Gmail credentials.';
    console.error('[mailer] ❌', errorMsg);
    throw new Error(errorMsg);
  }

  try {
    const mailOptions = {
      from: `"Mudhro Invoicing" <${gmailUser}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text || params.html.replace(/<[^>]*>/g, ''), // Fallback to plain text if not provided
      attachments: params.attachments,
    };

    console.log('[mailer] Sending email with options:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
      hasHtml: !!mailOptions.html,
      hasText: !!mailOptions.text,
      attachmentCount: mailOptions.attachments?.length || 0,
    });

    const info = await transporter.sendMail(mailOptions);

    console.log('[mailer] ✅ Email sent successfully!');
    console.log('[mailer] Message ID:', info.messageId);
    console.log('[mailer] Response:', info.response);
    
    return;
  } catch (error: any) {
    console.error('[mailer] ❌ Failed to send email:');
    console.error('[mailer] Error code:', error.code);
    console.error('[mailer] Error message:', error.message);
    console.error('[mailer] Error response:', error.response);
    console.error('[mailer] Full error:', error);
    
    // Provide more helpful error messages
    if (error.code === 'EAUTH') {
      throw new Error('Email authentication failed. Please check GMAIL_USER and GMAIL_APP_PASSWORD. Make sure you\'re using an App Password, not your regular Gmail password.');
    } else if (error.code === 'ECONNECTION') {
      throw new Error('Failed to connect to Gmail SMTP server. Check your internet connection.');
    } else if (error.responseCode === 550) {
      throw new Error(`Email rejected: ${error.response || 'Invalid recipient email address'}`);
    } else {
      throw new Error(`Failed to send email: ${error.message || 'Unknown error'}`);
    }
  }
};


