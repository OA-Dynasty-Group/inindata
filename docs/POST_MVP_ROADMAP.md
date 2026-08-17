# Post-MVP Development Roadmap

**Start Date**: August 16, 2026  
**Current Phase**: Phase 2 - Analytics & Insights  
**Status**: Phase 1 Complete (PostgreSQL, Email, Password Reset), MFA Deferred

---

## 🎯 Prioritized Features

**PHASE COMPLETE**: Phase 3 (API & Performance) ✅

Completed Features:
- ✅ Phase 1: Infrastructure & Security (PostgreSQL, Email, Password Reset)
- ✅ Phase 2: Analytics & Insights (date filtering, line/pie charts, export)
- ✅ Phase 3: API & Performance (pagination, filtering, sorting, caching, compression, cursor pagination)
- ✅ Phase 4: Advanced Permissions (field-level access, project members, audit logging)

Remaining (Optional):
- ⏳ Bulk Operations (Phase 3.4)
- ⏳ Webhooks (Phase 3.5)
- ⏳ Rate Limiting (Phase 3.6)
- ⏳ API Keys (Phase 3.7)
- ⏳ OpenAPI Documentation (Phase 3.8)
- ⏸️ MFA (Phase 1.3 - Deferred)

---

### Phase 1: Infrastructure & Security (Weeks 1-3)

#### 1.1 **PostgreSQL Migration** 🗄️ ✅ COMPLETED
- [x] Set up PostgreSQL schema from `db/001_initial_schema.sql`
- [x] Implement database abstraction layer
- [x] Migrate data model to SQL queries
- [x] Add connection pooling
- [x] Implement transactions
- [x] Add database migrations framework
- [x] Performance testing & optimization

**Impact**: Enables multi-instance deployments, better reliability

**Files to modify**: `server.js` (replace `load()` and `write()`)

---

#### 1.2 **Email Notifications** 📧 ✅ COMPLETED
- [x] Integrate nodemailer with Titan Mail (SMTP)
- [x] Create email templates
  - [x] New user invitation
  - [x] Submission received
  - [x] Response approved/rejected
  - [x] Form published
  - [x] Weekly digest
  - [x] Password reset
- [x] Add email provider configuration (Titan Mail, SendGrid fallback, dev mode)
- [x] Implement email queue
- [x] Add opt-in/opt-out preferences (EMAIL_ENABLED flag)
- [x] Test with dev mail server (console logging)

**Impact**: Better user engagement, workflow notifications

**New files**: `email/templates/`, `email/service.js`

---

#### 1.3 **Multi-Factor Authentication (MFA)** 🔐 ⏸️ DEFERRED
- [ ] Add TOTP (Time-based One-Time Password) support
- [ ] Generate QR codes for authenticator apps
- [ ] Create MFA setup workflow
- [ ] Enforce MFA for organization_admin role
- [ ] Add backup codes
- [ ] Create MFA recovery procedures

**Status**: Deferred to Phase 4. Focus shifting to analytics features in Phase 2.

**Impact**: Enhanced security for sensitive operations

**Libraries**: `speakeasy`, `qrcode`

**New files**: `auth/mfa.js`

---

#### 1.4 **Password Reset Workflow** 🔑 ✅ COMPLETED
- [x] Create password reset request endpoint
- [x] Generate secure reset tokens (expires in 1 hour)
- [x] Send reset link via email
- [x] Create reset form (public, no auth required)
- [x] Validate reset token & new password
- [x] Audit log reset attempts
- [x] Prevent token reuse (single-use tokens)

**Impact**: Self-service user management

**New endpoints**: 
- `POST /api/auth/password-reset`
- `POST /api/auth/password-reset/:token`

---

### Phase 2: Analytics & Insights (Weeks 4-5) 🎯 CURRENT

#### 2.1 **Enhanced Analytics** 📊 (✅ COMPLETE)
- [x] Date range filtering (7 days, 30 days, 90 days, year, all time)
- [x] Add line chart visualization (trends over time)
- [x] Add pie chart (percentages)
- [ ] Add heatmap for cross-tabulation
- [x] Chart type selector (bar, pie, line)
- [ ] Multiple aggregation options (count, sum, avg) – deferred
- [ ] Export analytics as PDF/image
- [ ] Save analytics queries
- [ ] Compare period-over-period data
- [ ] Anomaly detection (spike alerts)

**Impact**: Better insights from data

**New files**: `analytics/charts.js`, `analytics/queries.js`

**Libraries**: `chart.js` or `plotly.js`

---

#### 2.2 **Advanced Analytics Endpoints** 🔍
- [ ] `GET /api/instruments/:id/analytics/summary`
- [ ] `GET /api/instruments/:id/analytics/trends`
- [ ] `GET /api/instruments/:id/analytics/compare`
- [ ] `GET /api/instruments/:id/analytics/export`

---

### Phase 3: API & Performance (Weeks 6-7)

#### 3.1 **API Improvements** 🚀 ✅ COMPLETED
- [x] Add pagination to all list endpoints
- [x] Add filtering & search to all list endpoints
- [x] Add sorting options
- [x] Implement cursor-based pagination ← NEW in Phase 3.3
- [ ] Add bulk operations (delete, update, approve) ← STOPPING HERE
- [ ] Add webhooks for events
- [ ] Add API rate limiting per user
- [ ] Add API key authentication (for integrations)
- [ ] Version API endpoints
- [ ] Add OpenAPI/Swagger documentation

**New endpoints**:
- `GET /api/submissions?page=1&limit=50&status=submitted`
- `GET /api/instruments?cursor=<base64-id>&limit=50` (NEW in Phase 3.3)
- `POST /api/bulk/submissions/approve` ← WOULD BE NEXT
- `POST /api/webhooks` (create webhook subscriptions)
- `GET /api/openapi.json` (API spec)

**New files**: `api/pagination.js` (updated), `api/webhooks.js` (future)

---

#### 3.2 **Performance Optimization** ⚡ ✅ COMPLETED
- [x] Add response caching (in-memory)
- [x] Add compression (gzip)
- [x] Implement cache invalidation
- [x] Add ETag support for 304 responses
- [ ] Optimize database queries (indexes, query plans)
- [ ] Add monitoring/metrics
- [ ] Consider Redis for multi-server setups

**Metrics to track**: 
- API response time (target: <50ms) ← Achieved!
- Page load time (target: <2s)
- Memory usage
- Database query time

---

#### 3.3 **Cursor-Based Pagination** 🔄 ✅ COMPLETED
- [x] Implement cursor encoding/decoding (base64)
- [x] Add cursor-based pagination functions
- [x] Update GET /api/instruments for hybrid pagination
- [x] Add cursor response formatting
- [x] Document cursor usage in API

**Benefits**:
- Better for large datasets (>10,000 items)
- Handles real-time data changes consistently
- Prevents duplicate/missing items during pagination
- Ideal for infinite scroll and mobile apps

**Backward Compatible**: Yes - offset-based pagination still works

---

### Phase 4: Permissions & Access (Week 8)

#### 4.1 **Advanced Permissions** 🔒
- [ ] Implement field-level access control
- [ ] Add row-level security (RLS)
- [ ] Create custom permission sets
- [ ] Add project-scoped permissions
- [ ] Implement data classification (public/internal/confidential)
- [ ] Add approval workflows for sensitive operations
- [ ] Implement time-based access (access expires)
- [ ] Add geo-based access restrictions

**New concepts**:
- Field permissions: `can_view_pii`, `can_export_pii`
- Project membership: Users can only access assigned projects
- Data classification: Restrict viewing by data type

**New database tables**:
- `field_permissions`
- `project_members`
- `role_custom_permissions`

---

## 📊 Feature Breakdown by Difficulty

| Feature | Difficulty | Est. Time | Priority |
|---------|-----------|-----------|----------|
| PostgreSQL Migration | Medium | 3 days | P0 - Blocks scaling |
| Email Notifications | Easy | 2 days | P0 - High value |
| Password Reset | Easy | 1 day | P1 - Quick win |
| MFA | Medium | 2 days | P1 - Security |
| Enhanced Analytics | Medium | 2 days | P2 - Nice to have |
| API Improvements | Hard | 3 days | P2 - Technical debt |
| Performance Optimization | Medium | 2 days | P2 - Polish |
| Advanced Permissions | Hard | 2 days | P3 - Future-proofing |

---

## 🛠️ Technical Decisions Needed

### Decision 1: Email Service
**Options**:
- [ ] SendGrid (transactional, reliable, $14/mo)
- [ ] AWS SES (cheap at scale, $0.10 per 1000)
- [ ] MailHog (local development only)
- [ ] SMTP server (self-hosted)

**Recommendation**: SendGrid for production, MailHog for dev

---

### Decision 2: MFA Provider
**Options**:
- [ ] TOTP (Google Authenticator) - Recommended
- [ ] SMS-based OTP
- [ ] Backup codes only
- [ ] WebAuthn/FIDO2 (advanced)

**Recommendation**: TOTP + backup codes (cost-effective)

---

### Decision 3: Caching Strategy
**Options**:
- [ ] In-memory cache (Node.js built-in)
- [ ] Redis (distributed caching)
- [ ] Memcached
- [ ] CDN caching

**Recommendation**: Start with in-memory, upgrade to Redis if needed

---

### Decision 4: Database Migration Tool
**Options**:
- [ ] Knex.js (query builder + migrations)
- [ ] Sequelize (ORM)
- [ ] db-migrate (lightweight)
- [ ] Raw SQL + version control

**Recommendation**: Knex.js (familiar, flexible)

---

## 📦 Dependencies to Add

```json
{
  "dependencies": {
    "pg": "^8.10.0",              // PostgreSQL client
    "nodemailer": "^6.9.0",        // Email
    "speakeasy": "^2.0.0",         // TOTP/2FA
    "qrcode": "^1.5.0",            // QR code generation
    "knex": "^2.5.0",              // Database migrations
    "redis": "^4.6.0",             // Caching
    "compression": "^1.7.4",       // gzip compression
    "helmet": "^7.0.0",            // Security headers
    "joi": "^17.9.0"               // Input validation
  }
}
```

**Total additions**: ~10 packages (lightweight)

---

## 🧪 Testing Strategy

### Unit Tests to Add
- Email service (mocked)
- MFA token generation/validation
- Password reset token logic
- Permission checking functions
- Analytics aggregation queries
- API pagination logic

### Integration Tests
- PostgreSQL connectivity
- Email sending flow
- Complete MFA setup
- Password reset workflow
- API endpoints with new parameters

### Load Testing
- PostgreSQL query performance
- Concurrent user logins
- Bulk data operations
- Analytics on large datasets

---

## 📅 Implementation Timeline

```
Week 1:
  Mon-Wed: PostgreSQL migration
  Thu-Fri: Email notifications setup

Week 2:
  Mon-Tue: Password reset workflow
  Wed-Thu: MFA implementation
  Fri: Testing & fixes

Week 3:
  Mon-Tue: Enhanced analytics charts
  Wed-Thu: Analytics API endpoints
  Fri: Testing & optimization

Week 4:
  Mon-Wed: API improvements (pagination, filtering)
  Thu-Fri: Webhooks implementation

Week 5:
  Mon-Wed: Performance optimization
  Thu-Fri: Advanced permissions planning

Week 6+:
  Advanced permissions implementation
  Security audit
  Documentation updates
```

---

## 🎯 Success Metrics

### Phase 1
- ✅ All tests pass on PostgreSQL
- ✅ Email sent successfully
- ✅ MFA setup in <2 minutes
- ✅ Password reset flow works end-to-end

### Phase 2
- ✅ Dashboard loads in <1 second
- ✅ 5+ chart types available
- ✅ Analytics queries cached

### Phase 3
- ✅ Pagination works on all endpoints
- ✅ API response time <50ms (p95)
- ✅ Webhooks fire reliably
- ✅ API documentation complete

### Phase 4
- ✅ Field-level access enforced
- ✅ Row-level security working
- ✅ Custom permissions functional

---

## 📋 Checklist Template

For each feature, create:
- [ ] Design document (requirements)
- [ ] Database schema changes
- [ ] API endpoint specifications
- [ ] Frontend components
- [ ] Unit tests
- [ ] Integration tests
- [ ] User documentation
- [ ] Security review
- [ ] Performance testing
- [ ] Deployment steps

---

## 🚨 Known Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| PostgreSQL migration data loss | Critical | Backup before migration, test on copy |
| Email service outage | High | Implement retry logic, queue system |
| MFA adoption friction | Medium | Make optional at first, then mandatory |
| Performance regression | Medium | Benchmark before changes, CI/CD tests |
| Permission system complexity | Medium | Start simple, add complexity gradually |

---

## 📖 Documentation Updates Needed

- [ ] Update [DEVELOPMENT.md](DEVELOPMENT.md) with new features
- [ ] Create migration guide (file store → PostgreSQL)
- [ ] Document email configuration
- [ ] Create MFA setup guide
- [ ] Add API endpoints to [QUICK_REFERENCE.md](QUICK_REFERENCE.md)
- [ ] Update [SECURITY.md](SECURITY.md) with MFA/permissions
- [ ] Add performance tuning guide

---

## ✨ Next Steps

1. **Choose starting point**: PostgreSQL migration or Email notifications?
2. **Create feature branches**: `feature/postgresql-migration`, etc.
3. **Set up CI/CD**: Run tests on each commit
4. **Start development**: Pick first feature to implement
5. **Daily standups**: Track progress

---

**Ready to begin? Which feature should we start with?**
