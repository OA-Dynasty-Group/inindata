# Email Notifications with Titan Mail - Setup Guide

This guide explains how to set up email notifications using Titan Mail, the recommended email provider for Fieldwork.

## Why Titan Mail?

- ✅ **Excellent deliverability** - High inbox placement rates
- ✅ **Professional support** - 24/7 customer service
- ✅ **Enterprise features** - SPF, DKIM, DMARC support
- ✅ **Affordable** - Competitive pricing for nonprofits
- ✅ **Reliable** - 99.9% uptime SLA
- ✅ **Easy SMTP integration** - Works with any email library
- ✅ **Free trial** - Test before committing

## Part 1: Setting Up Titan Mail

### 1.1 Create a Titan Mail Account

1. Go to https://www.titanmail.io/
2. Click "Get Started" or "Sign Up"
3. Enter your organization details
4. Verify your email address
5. Create your account

### 1.2 Add Your Domain

Titan Mail works with your own domain for best deliverability.

#### Option A: Use Your Organization's Domain (Recommended)

1. Log in to Titan Mail dashboard
2. Click "Domains" → "Add Domain"
3. Enter your domain (e.g., `notifications.communityreach.org`)
4. Titan Mail will provide DNS records to add

**DNS Configuration:**

Add these records to your domain's DNS provider:

```
Type: MX
Name: notifications.communityreach.org
Value: mail.titanmail.io
Priority: 10
```

```
Type: TXT
Name: notifications.communityreach.org
Value: v=spf1 include:titanmail.io ~all
```

```
Type: CNAME (or TXT for DKIM)
Name: default._domainkey.notifications.communityreach.org
Value: [Provided by Titan Mail]
```

5. Wait for DNS propagation (usually 1-24 hours)
6. Verify domain in Titan Mail dashboard

#### Option B: Use Titan Mail's Shared Domain

If you don't want to configure DNS:

1. Use email addresses like: `notifications@titanmail.io`
2. Less recommended due to lower deliverability
3. Better for testing/development only

### 1.3 Create App Password / SMTP Credentials

1. In Titan Mail dashboard, go to Settings → SMTP
2. Click "Generate SMTP Credentials" or "App Passwords"
3. Create a new credential with:
   - **Name**: `Fieldwork`
   - **Permissions**: Send emails
   - **IP whitelist** (optional): Add your server IPs

4. Copy the credentials:
   - **SMTP Host**: `smtp.titanmail.io`
   - **SMTP Port**: `587` (TLS) or `465` (SSL)
   - **Username**: Your Titan Mail email or account ID
   - **Password**: The generated app password

**IMPORTANT**: Save these credentials securely. You'll need them for configuration.

## Part 2: Configure Fieldwork

### 2.1 Set Environment Variables

**For Local Development:**

Create or edit `.env` file in your project root:

```bash
# Email Configuration
EMAIL_ENABLED=true
EMAIL_PROVIDER=titanmail
EMAIL_FROM=notifications@communityreach.org

# Titan Mail SMTP Settings
TITANMAIL_HOST=smtp.titanmail.io
TITANMAIL_PORT=587
TITANMAIL_USER=your-titanmail-account@example.com
TITANMAIL_PASSWORD=your-app-password-here
```

**For Production (Vercel):**

1. Go to your Vercel project dashboard
2. Settings → Environment Variables
3. Add each variable:

| Name | Value |
|------|-------|
| `EMAIL_ENABLED` | `true` |
| `EMAIL_PROVIDER` | `titanmail` |
| `EMAIL_FROM` | `notifications@communityreach.org` |
| `TITANMAIL_HOST` | `smtp.titanmail.io` |
| `TITANMAIL_PORT` | `587` |
| `TITANMAIL_USER` | Your Titan Mail account email |
| `TITANMAIL_PASSWORD` | Your app password |

**Security Note**: Never commit passwords to Git. Use environment variables or secret management.

### 2.2 Install Dependencies

```bash
npm install
```

The `nodemailer` package is already specified in `package.json`.

### 2.3 Test Email Configuration

Test locally before deploying:

```bash
# Start the development server
npm start

# In another terminal, test the email endpoint
curl -X POST http://localhost:3000/api/email/test \
  -H "Content-Type: application/json" \
  -H "Cookie: fieldwork_session=YOUR_SESSION_TOKEN" \
  -d '{}'
```

Expected response:
```json
{
  "status": "sent",
  "messageId": "abc123def456"
}
```

### 2.4 Check Email Health

Monitor email service status:

```bash
curl http://localhost:3000/api/health/email
```

Expected response (if enabled):
```json
{
  "status": "ok",
  "provider": "titanmail"
}
```

Expected response (if disabled):
```json
{
  "status": "disabled",
  "provider": "titanmail"
}
```

## Part 3: Email Workflows

Fieldwork automatically sends emails for these events:

### 3.1 Form Submission Confirmation

**When**: User submits a public form
**To**: Respondent's email (if provided in form)
**Subject**: "Thank you for your response to [Form Name]"
**Requirement**: Form must include an email field named `respondentEmail`

Example form field:
```json
{
  "id": "q-email",
  "key": "respondentEmail",
  "type": "shortText",
  "label": "Your email address",
  "required": true
}
```

### 3.2 Review Notifications

**When**: A submission is reviewed (approved/rejected)
**To**: Email provided in review API call
**Subject**: "Your submission to [Form Name] has been [status]"
**Requirement**: Include `notificationEmail` in review request

Example API call:
```bash
curl -X POST http://localhost:3000/api/submissions/{id}/review \
  -H "Content-Type: application/json" \
  -H "Cookie: fieldwork_session=ADMIN_TOKEN" \
  -d '{
    "status": "approved",
    "notificationEmail": "respondent@example.com",
    "notes": "Great submission, thank you!"
  }'
```

### 3.3 Test Email

**Endpoint**: `POST /api/email/test`
**Permission Required**: `user:write` (admin)
**Response**: Email sent to current user's email address

```bash
curl -X POST http://localhost:3000/api/email/test \
  -H "Cookie: fieldwork_session=ADMIN_TOKEN"
```

## Part 4: Email Templates

Pre-built templates included in `email/service.js`:

| Template | Use | Parameters |
|----------|-----|------------|
| `userInvitation` | Invite new users | userName, inviterName, organizationName, inviteUrl |
| `submissionConfirmation` | Confirm form submission | respondentName, formName, submissionId |
| `reviewNotification` | Notify of review result | reviewerName, formName, status, submissionId, notes |
| `formPublished` | Announce new form | programName, formName, collectionUrl |
| `passwordReset` | Reset password link | userName, resetUrl |
| `weeklyDigest` | Weekly summary report | userName, organizationName, stats |

### Using Templates in Code

```javascript
const email = require('./email/service');

// Send using template
const message = email.templates.submissionConfirmation(
  'Jane Doe',
  'Community Needs Assessment',
  'sub-12345'
);

await email.sendEmail(
  'respondent@example.com',
  message.subject,
  message.text,
  message.html
);
```

## Part 5: Advanced Configuration

### 5.1 Email Queuing (Batch Sending)

For high-volume emails:

```javascript
const email = require('./email/service');

// Queue emails
email.queueEmail(user.email, 'userInvitation', [
  user.name,
  admin.name,
  'Organization Name',
  'https://app.example.com/invite/token123'
]);

// Manually flush queue when ready
await email.flushQueue();
```

### 5.2 Reply-To Address

```javascript
await email.sendEmail(
  'user@example.com',
  'Subject',
  'Text body',
  '<p>HTML body</p>',
  {
    replyTo: 'support@example.com',
    cc: 'admin@example.com',
    bcc: 'archive@example.com'
  }
);
```

### 5.3 Development Mode

For testing without sending real emails:

```bash
EMAIL_ENABLED=true
EMAIL_PROVIDER=dev
```

Emails will be logged to console instead of sent.

### 5.4 Monitoring Email Delivery

**Titan Mail Dashboard:**

1. Log in to https://dashboard.titanmail.io
2. Go to Reports → Email Activity
3. View sent, delivered, bounced, and opened emails

**Application Logs:**

Monitor email service logs:

```bash
# Development
tail -f console.log | grep "\[Email\]"

# Production (Vercel)
vercel logs --project ngo-data-platform
```

## Part 6: Troubleshooting

### Issue: "No auth method specified" Error

**Cause**: Titan Mail credentials not set
**Solution**: Ensure all TITANMAIL_* variables are set

```bash
# Verify environment variables
echo $TITANMAIL_HOST
echo $TITANMAIL_USER
```

### Issue: "Authentication failed" Error

**Cause**: Invalid credentials
**Solution**: 
1. Verify credentials in Titan Mail dashboard
2. Regenerate app password
3. Check username format (should be full email or account ID)

### Issue: "Invalid recipient" Error

**Cause**: Email address format invalid
**Solution**: Validate email format before sending

```javascript
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  throw new Error('Invalid email address');
}
```

### Issue: "Timeout" or "Connection refused" Error

**Cause**: Network or DNS issues
**Solution**:
1. Check TITANMAIL_HOST is correct
2. Verify port (587 for TLS, 465 for SSL)
3. Check firewall allows outbound SMTP
4. Test connectivity: `telnet smtp.titanmail.io 587`

### Issue: Emails not received (delivered to spam)

**Cause**: Missing SPF/DKIM/DMARC records
**Solution**:
1. Verify all DNS records are set correctly
2. Add DMARC policy: `v=DMARC1; p=none;`
3. Use custom domain (not shared domain)
4. Add "unsubscribe" link (best practice)

## Part 7: Alternative Providers

If Titan Mail doesn't work for you, try:

### SendGrid

```bash
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
```

### Google Workspace (if using Google for email)

```bash
EMAIL_PROVIDER=gmail
GMAIL_USER=notifications@yourdomain.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

### Development / Testing

```bash
EMAIL_PROVIDER=dev
# Logs to console instead of sending
```

## Part 8: Best Practices

1. **Use custom domain** - Better deliverability than shared domains
2. **Set up SPF/DKIM/DMARC** - Prevents spoofing and spam filtering
3. **Use app passwords** - More secure than account password
4. **Monitor bounce rates** - Remove invalid addresses
5. **Implement unsubscribe** - Legal requirement (CAN-SPAM, GDPR)
6. **Test with dev mode first** - Verify templates before production
7. **Rate limit emails** - Respect server limits
8. **Log all sends** - Audit trail for compliance

## Support

- **Titan Mail Support**: https://www.titanmail.io/support/
- **Nodemailer Docs**: https://nodemailer.com/
- **SMTP Configuration**: https://www.titanmail.io/smtp/

## Next Steps

1. ✅ Create Titan Mail account
2. ✅ Configure domain (SPF/DKIM/DMARC)
3. ✅ Generate SMTP credentials
4. ✅ Set environment variables
5. ✅ Test email endpoints
6. ✅ Deploy to production
7. ⬜ Phase 3: Multi-Factor Authentication
8. ⬜ Phase 4: Password Reset Workflow
