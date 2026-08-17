const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Router = require('./lib/router');
const { securityHeaders, isAllowedFile } = require('./lib/security');
const { json } = require('./lib/json');
const storage = require('./db/storage');
const email = require('./email/service');

const ROOT = __dirname;

// Import route modules
const authRoutes = require('./routes/auth');
const healthRoutes = require('./routes/health');
const dashboardRoutes = require('./routes/dashboard');
const userRoutes = require('./routes/users');
const instrumentRoutes = require('./routes/instruments');
const programRoutes = require('./routes/programs');
const reportRoutes = require('./routes/reports');
const dashboardCrudRoutes = require('./routes/dashboards');
const organizationRoutes = require('./routes/organization');
const auditRoutes = require('./routes/audit');
const collectRoutes = require('./routes/collect');
const projectRoutes = require('./routes/projects');

function initialData() { return storage.initialData(); }
function load() { return storage.load(); }

function staticFile(res, pathname) {
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.resolve(ROOT, requested);
  const outsideRoot = path.relative(ROOT, file).startsWith('..');
  if (outsideRoot || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return json(res, 404, { error: 'Not found' });
  }
  if (!isAllowedFile(pathname)) {
    return json(res, 403, { error: 'Forbidden' });
  }
  const mime = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff'
  }[path.extname(file)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` });
  fs.createReadStream(file).pipe(res);
}

function emailTest(req, res, data) {
  const { requirePermission } = require('./lib/auth');
  return requirePermission('user:write', async (req, res, data) => {
    const result = await email.sendEmail(
      req.user.email,
      'Test Email from Fieldwork',
      'This is a test email to verify your email configuration is working correctly.',
      '<h2>Test Email</h2><p>This is a test email to verify your email configuration is working correctly.</p>'
    );
    return json(res, result.status === 'sent' ? 200 : 503, result);
  })(req, res, data);
}

// Build router
const router = new Router();

// Health
router.get('/api/health', healthRoutes.health);
router.get('/api/health/db', healthRoutes.healthDb);
router.get('/api/health/email', healthRoutes.healthEmail);
router.post('/api/email/test', emailTest);

// Auth
router.post('/api/auth/signup', authRoutes.signup);
router.post('/api/auth/login', authRoutes.login);
router.post('/api/auth/logout', authRoutes.logout);
router.get('/api/me', authRoutes.me);
router.post('/api/auth/password-reset', authRoutes.passwordReset);
router.post('/api/auth/password-reset/confirm', authRoutes.passwordResetConfirm);

// Dashboard metrics
router.get('/api/dashboard', dashboardRoutes.getDashboard);

// Users
router.get('/api/users', userRoutes.list);
router.post('/api/users', userRoutes.create);
router.patch('/api/users/:id/status', userRoutes.updateStatus);

// Instruments (CRUD)
router.get('/api/instruments', instrumentRoutes.list);
router.post('/api/instruments', instrumentRoutes.create);

// Instruments (by ID)
router.get('/api/instruments/:id', instrumentRoutes.get);
router.put('/api/instruments/:id', instrumentRoutes.update);
router.post('/api/instruments/:id/publish', instrumentRoutes.publish);
router.get('/api/instruments/:id/submissions', instrumentRoutes.submissions);
router.get('/api/instruments/:id/dataset/export', instrumentRoutes.datasetExport);
router.get('/api/instruments/:id/dataset', instrumentRoutes.dataset);
router.get('/api/instruments/:id/analytics', instrumentRoutes.analytics);
router.post('/api/instruments/:id/dataset/import/preview', instrumentRoutes.importPreviewHandler);
router.post('/api/instruments/:id/dataset/import', instrumentRoutes.importConfirm);
router.get('/api/instruments/:id/field-access', instrumentRoutes.fieldAccessGet);
router.post('/api/instruments/:id/field-access', instrumentRoutes.fieldAccessSet);

// Programs
router.get('/api/programs', programRoutes.list);
router.post('/api/programs', programRoutes.create);
router.post('/api/programs/:id/projects', programRoutes.createProject);

// Reports
router.get('/api/reports', reportRoutes.list);
router.post('/api/reports', reportRoutes.create);

// Dashboards
router.get('/api/dashboards', dashboardCrudRoutes.list);
router.post('/api/dashboards', dashboardCrudRoutes.create);

// Organization
router.get('/api/organization', organizationRoutes.get);
router.patch('/api/organization', organizationRoutes.update);

// Audit logs
router.get('/api/audit-logs', auditRoutes.list);

// Collect (public)
router.get('/api/collect/:token', collectRoutes.getInstrument);
router.post('/api/collect/:token/submissions', collectRoutes.submit);

// Project members
router.get('/api/projects/:id/members', projectRoutes.listMembers);
router.post('/api/projects/:id/members', projectRoutes.addMember);

// Submissions review
const { requirePermission } = require('./lib/auth');
router.post('/api/submissions/:id/review', requirePermission('submission:review', async (req, res, data, params) => {
  const { readBody, json: jsonResponse } = require('./lib/json');
  const { canReviewTransition } = instrumentRoutes;
  const { currentUser } = require('./lib/auth');
  const crypto = require('node:crypto');
  const submission = data.submissions.find(s => s.id === params.id);
  if (!submission) return jsonResponse(res, 404, { error: 'Submission not found.' });
  const body = await readBody(req);
  if (!['approved', 'rejected', 'locked'].includes(body.status)) return jsonResponse(res, 422, { error: 'Use approved, rejected, or locked as the review status.' });
  if (!canReviewTransition(submission.status, body.status)) return jsonResponse(res, 409, { error: `A ${submission.status} response cannot move to ${body.status}.` });
  submission.status = body.status;
  submission.reviewedAt = new Date().toISOString();
  const user = await currentUser(req, data);
  submission.reviewedBy = user.id;
  data.auditLogs.unshift({ id: crypto.randomUUID(), action: body.status.toUpperCase(), resourceType: 'submission', resourceId: submission.id, actor: 'local-admin', timestamp: new Date().toISOString(), metadata: { instrumentId: submission.instrumentId } });
  storage.write(data);
  if (email.ENABLED && body.notificationEmail) {
    const inst = data.instruments.find(i => i.id === submission.instrumentId);
    email.sendEmail(body.notificationEmail, `Your submission to "${inst?.name}" has been ${body.status}`, `Your submission (ID: ${submission.id}) has been reviewed and marked as ${body.status}. ${body.notes ? `Notes: ${body.notes}` : ''}`, `<h2>Your submission has been reviewed</h2><p>Your submission to <strong>"${inst?.name}"</strong> has been marked as <strong>${body.status}</strong>.</p><p><strong>Submission ID:</strong> ${submission.id}</p>${body.notes ? `<p><strong>Notes:</strong></p><p>${body.notes.split('\n').join('<br>')}</p>` : ''}`).catch(err => console.error('[Email] Failed to send review notification:', err.message));
  }
  return jsonResponse(res, 200, { id: submission.id, status: submission.status });
}));

// Main request handler
const handler = async (req, res) => {
  try {
    securityHeaders(res);
    req._sessions = authRoutes.sessions;
    const url = new URL(req.url, `http://${req.headers.host}`);

    // API routes
    if (url.pathname.startsWith('/api/')) {
      const matched = await router.handle(req, res, load());
      if (matched) return;
    }

    // Static files
    return staticFile(res, url.pathname);
  } catch (error) {
    return json(res, error.message === 'Invalid JSON body' ? 400 : 500, { error: error.message || 'Unexpected server error.' });
  }
};

module.exports = handler;
module.exports.default = handler;

// Backward-compatible exports for tests
const { validateDefinition, validateSubmission, datasetFor, aggregateDataset, isVisible, canReviewTransition } = instrumentRoutes;
module.exports.initialData = initialData;
module.exports.validateDefinition = validateDefinition;
module.exports.validateSubmission = validateSubmission;
module.exports.datasetFor = datasetFor;
module.exports.importPreview = instrumentRoutes.importPreview;
module.exports.aggregateDataset = aggregateDataset;
module.exports.canReviewTransition = canReviewTransition;
module.exports.isVisible = isVisible;
module.exports.rolePermissions = (role) => (storage.ROLE_PERMISSIONS[role] || []);

if (require.main === module) {
  const httpServer = http.createServer(handler);
  const port = process.env.FIELDWORK_PORT || 3000;
  const isProduction = process.env.NODE_ENV === 'production';
  const isVercel = !!process.env.VERCEL;

  console.log(`[Startup] Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(`[Startup] Platform: ${isVercel ? 'Vercel' : 'Local/Self-hosted'}`);

  if (storage.USE_DATABASE) {
    console.log(`[Startup] Database: PostgreSQL (via ${process.env.DATABASE_URL_PGBOUNCER ? 'PgBouncer' : 'Direct connection'})`);
    if (process.env.SUPABASE_URL) {
      console.log(`[Startup] Provider: Supabase`);
    }
  } else {
    console.log('[Startup] Database: File-based storage (development mode)');
  }

  httpServer.listen(port, () => {
    console.log(`[Ready] Fieldwork listening on http://localhost:${port}`);
  });
}
