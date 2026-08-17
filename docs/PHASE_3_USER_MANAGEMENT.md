# Phase 3: User Management, Organization Settings, and Password Reset

**Status:** ✅ Complete and tested  
**All 14 tests passing:** Yes  
**Deployment ready:** Yes  

## Overview

Phase 3 completes the core user administration workflows for Fieldwork:

1. **Organization Settings** – Manage organization name and profile
2. **User Management** – Create, list, and manage team members with role-based access
3. **Password Reset** – Secure password reset flow with email verification

All workflows are designed for both file-based storage (development) and PostgreSQL (production).

---

## 1. Organization Settings

### Endpoints

#### GET /api/organization
Returns the current organization details. Requires authentication.

**Request:**
```bash
curl -H "Cookie: fieldwork_session=<token>" \
  http://localhost:3000/api/organization
```

**Response:**
```json
{
  "id": "org-123",
  "name": "Community Reach",
  "code": "CR",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

#### PATCH /api/organization
Update organization name. Requires `user:write` permission (admin or program manager).

**Request:**
```bash
curl -X PATCH \
  -H "Cookie: fieldwork_session=<token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "New Organization Name"}' \
  http://localhost:3000/api/organization
```

**Response:**
```json
{
  "id": "org-123",
  "name": "New Organization Name",
  "code": "CR",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### UI

1. **Access:** Click the organization avatar in the sidebar footer or go to "Settings" → "Organization"
2. **Features:**
   - View current organization name
   - Edit organization name inline
   - See team member count
   - Quick link to manage users
   - Quick link to change password

---

## 2. User Management

### User Creation

Users can be created via the User Management interface with the following roles:

- **Organization Admin** – Full access to all organization features and settings
- **Program Manager** – Manage programs, projects, and form responses
- **Reviewer** – Review and approve/reject form submissions
- **Analyst** – View and analyze data (read-only)
- **Field Worker** – Submit forms only (no access to other features)

#### Endpoints

**GET /api/users** – List all users  
Requires `user:read` permission.

```bash
curl -H "Cookie: fieldwork_session=<token>" \
  http://localhost:3000/api/users
```

**POST /api/users** – Create a new user  
Requires `user:write` permission.

```bash
curl -X POST \
  -H "Cookie: fieldwork_session=<token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Smith",
    "email": "john@example.com",
    "password": "SecurePassword123!",
    "role": "program_manager"
  }' \
  http://localhost:3000/api/users
```

**Response:**
```json
{
  "id": "user-456",
  "name": "John Smith",
  "email": "john@example.com",
  "status": "active",
  "roles": ["program_manager"],
  "permissions": ["program:read", "program:write", "project:read", "project:write", "submission:review", ...]
}
```

### User Status Management

#### PATCH /api/users/{id}/status
Update user status (suspend/reactivate). Requires `user:write` permission.

```bash
curl -X PATCH \
  -H "Cookie: fieldwork_session=<token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "suspended"}' \
  http://localhost:3000/api/users/user-456/status
```

### UI Flow

1. **Navigate to Users** – Click "Users" in the sidebar (under Govern section)
2. **Create User:**
   - Click "Add user" button
   - Enter name, email, role
   - Set initial password (min 12 characters)
   - Click "Save"
   - ✉️ If email is configured, welcome email is automatically sent
3. **Manage Users:**
   - View all users in a table with roles
   - Click "Suspend" to deactivate a user
   - Click "Reactivate" to restore access

### Email Integration

When a user is created, the system automatically sends a welcome email (if `EMAIL_ENABLED=true`):

**Subject:** Welcome to [Organization Name]  
**Message:** 
```
Welcome [User Name]!

You have been added to [Organization Name].

You can now sign in with:
- Email: [user@example.com]
- Password: The one provided to you

[Sign in to Organization Name]
```

---

## 3. Password Reset Workflow

### Forgot Password Flow

1. **User clicks "Forgot your password?" link** on login page
2. **Enter email address** of their account
3. **System sends reset email** with a password reset link
4. **User clicks link or enters reset code**
5. **Set new password** (min 12 characters)
6. **Password updated** and user can sign in

### Endpoints

#### POST /api/auth/password-reset
Request a password reset. Does NOT require authentication.

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"email": "john@example.com"}' \
  http://localhost:3000/api/auth/password-reset
```

**Response:**
```json
{
  "message": "Password reset instructions have been sent to your email."
}
```

**Token Expiry:** 1 hour  
**Email Template:** Includes personalized reset link

#### POST /api/auth/password-reset/confirm
Complete password reset with token. Does NOT require authentication.

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "token": "ABC123...",
    "password": "NewSecurePassword123!"
  }' \
  http://localhost:3000/api/auth/password-reset/confirm
```

**Response:**
```json
{
  "message": "Password has been reset successfully."
}
```

### Reset Email Template

**Subject:** Reset your password  
**Message:**
```
Hello [User Name],

You requested a password reset for your Fieldwork account.

[Reset Password Button]

This link expires in 1 hour. If you didn't request this, you can ignore this email.
```

### Security Features

- ✅ Single-use tokens (one-time reset per request)
- ✅ Time-limited (1 hour expiry)
- ✅ Logged in audit trail (`PASSWORD_RESET_REQUEST`, `PASSWORD_RESET_COMPLETE`)
- ✅ Minimum 12-character passwords enforced
- ✅ Invalid or expired tokens rejected
- ✅ Public endpoint (no prior authentication required)

---

## 4. Database Schema

### File-Based Storage (data/store.json)

```javascript
{
  "organization": {
    "id": "org-123",
    "name": "Community Reach",
    "code": "CR"
  },
  "users": [
    {
      "id": "user-123",
      "name": "Admin User",
      "email": "admin@example.com",
      "status": "active",
      "roles": ["organization_admin"],
      "permissions": [/* all permissions */],
      "password": "hashed-password",
      "passwordResetToken": null,
      "passwordResetExpiry": null
    }
  ],
  // ... other collections
}
```

### PostgreSQL Schema

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(10),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  roles TEXT[] DEFAULT ARRAY[]::TEXT[],
  permissions TEXT[] DEFAULT ARRAY[]::TEXT[],
  password VARCHAR(255),
  password_reset_token VARCHAR(255),
  password_reset_expiry BIGINT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE auth_sessions (
  token VARCHAR(255) PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '8 hours'
);
```

---

## 5. Audit Trail

All Phase 3 operations are logged in the audit trail:

- `CREATE` – New user created (includes email and role)
- `UPDATE` – Organization name changed
- `PASSWORD_RESET_REQUEST` – User requested password reset (logged with email)
- `PASSWORD_RESET_COMPLETE` – Password successfully reset
- `UPDATE` – User status changed (suspended/reactivated)

**Audit Entry Example:**
```json
{
  "id": "audit-789",
  "action": "CREATE",
  "resourceType": "user",
  "resourceId": "user-456",
  "actor": "local-admin",
  "timestamp": "2024-01-15T10:30:45.000Z",
  "metadata": {
    "email": "john@example.com",
    "role": "program_manager"
  }
}
```

---

## 6. Environment Configuration

### Required (Production)

```env
# Database
DATABASE_URL_PGBOUNCER=postgresql://user:pass@host:6543/dbname
# or
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Email (optional but recommended)
EMAIL_ENABLED=true
EMAIL_PROVIDER=titanmail
TITANMAIL_HOST=smtp.titanmail.io
TITANMAIL_USER=your-username
TITANMAIL_PASSWORD=your-password
EMAIL_FROM=noreply@example.com

# Public URL (for password reset links)
FIELDWORK_PUBLIC_URL=https://fieldwork.example.com
```

### Development

```env
# File-based storage (default)
# Leave DATABASE_URL unset to use data/store.json

# Email (optional)
EMAIL_ENABLED=false  # Logs to console instead of sending
```

---

## 7. Testing

All Phase 3 features have been tested to ensure:

✅ **14/14 unit tests passing**
✅ **No breaking changes** to existing functionality
✅ **Backward compatible** with file-based storage
✅ **Production ready** for Supabase + Vercel deployment

### Test Coverage

- Organization settings CRUD
- User creation and role assignment
- Password reset token generation and validation
- Email template rendering
- Audit logging
- Role-based access control

---

## 8. Production Deployment

### Supabase + Vercel

1. **Set up PostgreSQL** in Supabase
2. **Configure environment variables** in Vercel:
   ```
   DATABASE_URL_PGBOUNCER=postgresql://[user]:[password]@db.supabase.co:6543/postgres
   EMAIL_ENABLED=true
   TITANMAIL_HOST=smtp.titanmail.io
   TITANMAIL_USER=[account]
   TITANMAIL_PASSWORD=[password]
   EMAIL_FROM=noreply@yourorg.com
   FIELDWORK_PUBLIC_URL=https://fieldwork.example.com
   ```

3. **Deploy** via Vercel (automatic from GitHub)

### Self-Hosted (Docker/systemd)

1. **Set DATABASE_URL** for PostgreSQL connection
2. **Set EMAIL_* variables** for Titan Mail
3. **Deploy** using existing Docker or systemd configuration

---

## 9. Troubleshooting

### "Sign in is required" on password reset
- Password reset is a public endpoint but users must provide valid email
- If email not found in database, a 404 error is returned (security: doesn't reveal user existence)

### Email not sending
1. Check `EMAIL_ENABLED=true` is set
2. Verify `TITANMAIL_HOST`, `TITANMAIL_USER`, `TITANMAIL_PASSWORD` credentials
3. Check email logs: `grep -i email server.log`
4. Try `/api/health/email` endpoint to test configuration

### Password reset link expired
- Links expire after 1 hour
- User must request a new reset via "Forgot your password?" link
- Each request generates a new token

### User can't access organization settings
- User must have `user:write` permission
- Only `organization_admin` and `program_manager` roles have this permission
- Check user role in Users page

---

## 10. What's Next? (Future Phases)

**Phase 4 (Planned):**
- [ ] Bulk user import (CSV)
- [ ] Single Sign-On (SSO) integration
- [ ] Two-factor authentication (2FA)
- [ ] User profile customization
- [ ] Team/department management

---

## Summary

✅ **Organization Settings** – Manage org profile  
✅ **User Management** – Create, list, suspend/reactivate users  
✅ **Password Reset** – Secure, email-based password recovery  
✅ **Audit Trail** – All admin actions logged  
✅ **Email Integration** – Automatic welcome and reset emails  
✅ **Role-Based Access** – 5 roles with granular permissions  
✅ **Production Ready** – Works with Supabase + Vercel  

All 14 unit tests passing. No breaking changes. Ready for production deployment.
