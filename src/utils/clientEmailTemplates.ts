/**
 * Email templates for client portal authentication
 */

export interface OTPEmailParams {
  otp: string;
  clientName: string;
  expiryMinutes?: number;
}

/**
 * Build OTP email template
 */
export const buildOTPEmail = (params: OTPEmailParams): { subject: string; html: string; text: string } => {
  const { otp, clientName, expiryMinutes = 5 } = params;

  const subject = 'Your Mudhro Client Portal Login Code';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login Code</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px; border: 1px solid #e0e0e0;">
    <h2 style="color: #2c3e50; margin-top: 0;">Your Login Code</h2>
    
    <p>Hello ${clientName},</p>
    
    <p>You have requested to log in to your Mudhro Client Portal. Use the code below to complete your login:</p>
    
    <div style="background-color: #ffffff; border: 2px dashed #3498db; border-radius: 6px; padding: 20px; text-align: center; margin: 30px 0;">
      <div style="font-size: 32px; font-weight: bold; color: #3498db; letter-spacing: 8px; font-family: 'Courier New', monospace;">
        ${otp}
      </div>
    </div>
    
    <p style="color: #e74c3c; font-weight: bold;">⚠️ Security Warning:</p>
    <ul style="color: #555;">
      <li>This code will expire in <strong>${expiryMinutes} minutes</strong></li>
      <li>Do not share this code with anyone</li>
      <li>If you did not request this code, please ignore this email</li>
      <li>You have <strong>3 attempts</strong> to enter the correct code</li>
    </ul>
    
    <p style="margin-top: 30px; color: #7f8c8d; font-size: 14px;">
      This is an automated email. Please do not reply to this message.
    </p>
    
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
    
    <p style="color: #95a5a6; font-size: 12px; margin: 0;">
      © ${new Date().getFullYear()} Mudhro. All rights reserved.
    </p>
  </div>
</body>
</html>
  `.trim();

  const text = `
Your Mudhro Client Portal Login Code

Hello ${clientName},

You have requested to log in to your Mudhro Client Portal. Use the code below to complete your login:

${otp}

Security Warning:
- This code will expire in ${expiryMinutes} minutes
- Do not share this code with anyone
- If you did not request this code, please ignore this email
- You have 3 attempts to enter the correct code

This is an automated email. Please do not reply to this message.

© ${new Date().getFullYear()} Mudhro. All rights reserved.
  `.trim();

  return { subject, html, text };
};
