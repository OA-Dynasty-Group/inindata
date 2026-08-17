// Email service with support for Titan Mail, SendGrid, and local development
const nodemailer = require('nodemailer');

// Email provider configuration
const PROVIDER = process.env.EMAIL_PROVIDER || 'titanmail';
let ENABLED = !!process.env.EMAIL_ENABLED || process.env.TITANMAIL_HOST;

let transporter = null;
let emailQueue = [];

/**
 * Initialize email transport based on provider
 */
function initializeTransport() {
  if (!ENABLED) {
    console.log('[Email] Email notifications disabled (EMAIL_ENABLED not set)');
    return;
  }

  try {
    if (PROVIDER === 'titanmail') {
      transporter = initializeTitanMail();
    } else if (PROVIDER === 'sendgrid') {
      transporter = initializeSendGrid();
    } else if (PROVIDER === 'dev') {
      transporter = initializeDevMailer();
    } else {
      console.warn(`[Email] Unknown provider: ${PROVIDER}`);
      return;
    }

    console.log(`[Email] Email service initialized: ${PROVIDER}`);
  } catch (error) {
    console.error(`[Email] Failed to initialize ${PROVIDER}:`, error.message);
    ENABLED = false;
  }
}

/**
 * Initialize Titan Mail SMTP (preferred)
 * Titan Mail provides reliable email with excellent deliverability
 * Documentation: https://www.titanmail.io/
 */
function initializeTitanMail() {
  const host = process.env.TITANMAIL_HOST || 'smtp.titanmail.io';
  const port = process.env.TITANMAIL_PORT || 587;
  const secure = port === 465; // true for 465, false for other ports
  const user = process.env.TITANMAIL_USER;
  const pass = process.env.TITANMAIL_PASSWORD;

  if (!user || !pass) {
    throw new Error('Titan Mail requires TITANMAIL_USER and TITANMAIL_PASSWORD');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    pool: {
      maxConnections: 5,
      maxMessages: 100,
      rateDelta: 1000, // ms
      rateLimit: 5, // emails per rateDelta
    },
  });
}

/**
 * Initialize SendGrid (alternative)
 * SendGrid API v3 via nodemailer
 */
function initializeSendGrid() {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error('SendGrid requires SENDGRID_API_KEY');
  }

  return nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    auth: {
      user: 'apikey',
      pass: apiKey,
    },
  });
}

/**
 * Development mailer - logs to console
 * Useful for testing without real SMTP
 */
function initializeDevMailer() {
  return {
    sendMail: async (mailOptions) => {
      console.log('[Email] DEV MODE - Would send:');
      console.log(`  To: ${mailOptions.to}`);
      console.log(`  Subject: ${mailOptions.subject}`);
      console.log(`  Body preview: ${mailOptions.text?.substring(0, 100)}...`);
      return { messageId: `dev-${Date.now()}` };
    },
  };
}

/**
 * Email templates
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const templates = {
  // User invitation template
  userInvitation: (userName, inviterName, organizationName, inviteUrl) => ({
    subject: `You've been invited to ${organizationName}`,
    text: `
Hello ${userName},

${inviterName} has invited you to join ${organizationName} on the Fieldwork data platform.

Please accept the invitation and set your password:
${inviteUrl}

This link expires in 7 days.

Best regards,
Fieldwork Team
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; color: #333;">
  <h2>You're invited to ${escapeHtml(organizationName)}!</h2>
  <p>Hello ${escapeHtml(userName)},</p>
  <p><strong>${escapeHtml(inviterName)}</strong> has invited you to join <strong>${escapeHtml(organizationName)}</strong> on the Fieldwork data platform.</p>
  <p>
    <a href="${inviteUrl}" style="display: inline-block; padding: 12px 20px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 4px;">
      Accept Invitation
    </a>
  </p>
  <p style="color: #666; font-size: 12px;">This link expires in 7 days.</p>
  <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
  <p style="color: #999; font-size: 12px;">© 2026 Fieldwork. All rights reserved.</p>
</body>
</html>
    `.trim(),
  }),

  // Form submission confirmation
  submissionConfirmation: (respondentName, formName, submissionId) => ({
    subject: `Thank you for your submission to "${formName}"`,
    text: `
Hello ${respondentName},

We have successfully received your response to the form "${formName}".

Submission ID: ${submissionId}

If you have any questions, please contact the form administrator.

Thank you,
Fieldwork Team
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; color: #333;">
  <h2>Thank you for your submission!</h2>
  <p>Hello ${escapeHtml(respondentName)},</p>
  <p>We have successfully received your response to the form <strong>"${escapeHtml(formName)}"</strong>.</p>
  <p><strong>Submission ID:</strong> <code style="background: #f0f0f0; padding: 2px 6px;">${escapeHtml(submissionId)}</code></p>
  <p>If you have any questions, please contact the form administrator.</p>
  <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
  <p style="color: #999; font-size: 12px;">© 2026 Fieldwork. All rights reserved.</p>
</body>
</html>
    `.trim(),
  }),

  // Review notification (submission approved/rejected)
  reviewNotification: (reviewerName, formName, status, submissionId, notes = '') => ({
    subject: `Your submission to "${formName}" has been ${status}`,
    text: `
Hello,

Your submission to "${formName}" has been reviewed and marked as ${status}.

Submission ID: ${submissionId}
Status: ${status.toUpperCase()}

${notes ? `Reviewer notes:\n${notes}\n` : ''}

If you have questions about this decision, please contact the reviewer.

Best regards,
Fieldwork Team
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; color: #333;">
  <h2>Your submission has been reviewed</h2>
  <p>Hello,</p>
  <p>Your submission to <strong>"${escapeHtml(formName)}"</strong> has been reviewed and marked as <strong>${escapeHtml(status.toUpperCase())}</strong>.</p>
  <p>
    <strong>Submission ID:</strong> <code style="background: #f0f0f0; padding: 2px 6px;">${escapeHtml(submissionId)}</code><br>
    <strong>Status:</strong> ${escapeHtml(status)}
  </p>
  ${notes ? `<p><strong>Reviewer notes:</strong></p><p>${escapeHtml(notes).split('\n').join('<br>')}</p>` : ''}
  <p>If you have questions about this decision, please contact the reviewer.</p>
  <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
  <p style="color: #999; font-size: 12px;">© 2026 Fieldwork. All rights reserved.</p>
</body>
</html>
    `.trim(),
  }),

  // Form published notification
  formPublished: (programName, formName, collectionUrl) => ({
    subject: `New form available: "${formName}"`,
    text: `
Hello,

A new form has been published and is ready for data collection.

Program: ${programName}
Form: ${formName}

Start collecting responses:
${collectionUrl}

Best regards,
Fieldwork Team
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; color: #333;">
  <h2>New form is ready for data collection!</h2>
  <p>Hello,</p>
  <p>A new form has been published and is ready for data collection.</p>
  <p>
    <strong>Program:</strong> ${escapeHtml(programName)}<br>
    <strong>Form:</strong> ${escapeHtml(formName)}
  </p>
  <p>
    <a href="${collectionUrl}" style="display: inline-block; padding: 12px 20px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 4px;">
      Start Collecting Responses
    </a>
  </p>
  <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
  <p style="color: #999; font-size: 12px;">© 2026 Fieldwork. All rights reserved.</p>
</body>
</html>
    `.trim(),
  }),

  // Password reset notification
  passwordReset: (userName, resetUrl) => ({
    subject: 'Reset your Fieldwork password',
    text: `
Hello ${userName},

You requested a password reset for your Fieldwork account.

Click the link below to reset your password:
${resetUrl}

This link expires in 1 hour.

If you didn't request this, please ignore this email.

Best regards,
Fieldwork Team
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; color: #333;">
  <h2>Reset your password</h2>
  <p>Hello ${escapeHtml(userName)},</p>
  <p>You requested a password reset for your Fieldwork account.</p>
  <p>
    <a href="${resetUrl}" style="display: inline-block; padding: 12px 20px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 4px;">
      Reset Password
    </a>
  </p>
  <p style="color: #666; font-size: 12px;">This link expires in 1 hour. If you didn't request this, please ignore this email.</p>
  <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
  <p style="color: #999; font-size: 12px;">© 2026 Fieldwork. All rights reserved.</p>
</body>
</html>
    `.trim(),
  }),

  // Weekly digest report
  weeklyDigest: (userName, organizationName, stats) => ({
    subject: `Weekly report for ${organizationName}`,
    text: `
Hello ${userName},

Here's your weekly summary for ${organizationName}:

Submissions received: ${stats.submissionsReceived}
Forms active: ${stats.formsActive}
Users: ${stats.usersActive}
Data reviewed: ${stats.dataReviewed}

Log in to see detailed analytics:
${stats.dashboardUrl}

Best regards,
Fieldwork Team
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; color: #333;">
  <h2>Weekly Report for ${escapeHtml(organizationName)}</h2>
  <p>Hello ${escapeHtml(userName)},</p>
  <p>Here's your weekly summary:</p>
  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <tr style="background: #f5f5f5;">
      <td style="padding: 10px; border: 1px solid #ddd;"><strong>Submissions received</strong></td>
      <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${escapeHtml(stats.submissionsReceived)}</td>
    </tr>
    <tr>
      <td style="padding: 10px; border: 1px solid #ddd;"><strong>Forms active</strong></td>
      <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${escapeHtml(stats.formsActive)}</td>
    </tr>
    <tr style="background: #f5f5f5;">
      <td style="padding: 10px; border: 1px solid #ddd;"><strong>Active users</strong></td>
      <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${escapeHtml(stats.usersActive)}</td>
    </tr>
    <tr>
      <td style="padding: 10px; border: 1px solid #ddd;"><strong>Data reviewed</strong></td>
      <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${escapeHtml(stats.dataReviewed)}</td>
    </tr>
  </table>
  <p>
    <a href="${stats.dashboardUrl}" style="display: inline-block; padding: 12px 20px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 4px;">
      View Full Dashboard
    </a>
  </p>
  <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
  <p style="color: #999; font-size: 12px;">© 2026 Fieldwork. All rights reserved.</p>
</body>
</html>
    `.trim(),
  }),
};

/**
 * Send email
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} text - Plain text body
 * @param {string} html - HTML body
 * @param {object} options - Additional options (replyTo, cc, bcc, etc)
 */
async function sendEmail(to, subject, text, html, options = {}) {
  if (!ENABLED) {
    console.log('[Email] Email disabled - skipping:', { to, subject });
    return { status: 'disabled' };
  }

  if (!transporter) {
    console.warn('[Email] Transporter not initialized');
    return { status: 'not_initialized' };
  }

  const from = process.env.EMAIL_FROM || process.env.TITANMAIL_USER || 'noreply@fieldwork.local';

  try {
    const result = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
      ...options,
    });

    console.log('[Email] Sent:', { to, subject, messageId: result.messageId });
    return { status: 'sent', messageId: result.messageId };
  } catch (error) {
    console.error('[Email] Failed to send:', { to, subject, error: error.message });
    return { status: 'failed', error: error.message };
  }
}

/**
 * Queue email for sending (useful for batch operations)
 */
function queueEmail(to, template, params) {
  emailQueue.push({ to, template, params, queuedAt: new Date() });
  if (emailQueue.length >= 10) {
    flushQueue();
  }
}

/**
 * Flush email queue
 */
async function flushQueue() {
  const queue = emailQueue.splice(0);
  for (const item of queue) {
    const template = templates[item.template];
    if (template) {
      const message = template(...item.params);
      await sendEmail(item.to, message.subject, message.text, message.html);
    }
  }
}

/**
 * Health check
 */
async function health() {
  if (!ENABLED || !transporter) {
    return { status: 'disabled', provider: PROVIDER };
  }

  try {
    await transporter.verify?.();
    return { status: 'ok', provider: PROVIDER };
  } catch (error) {
    return { status: 'error', provider: PROVIDER, error: error.message };
  }
}

// Initialize on module load
initializeTransport();

// Graceful shutdown
process.on('exit', () => {
  flushQueue();
});

module.exports = {
  ENABLED,
  PROVIDER,
  sendEmail,
  queueEmail,
  flushQueue,
  templates,
  health,
  transporter,
};
