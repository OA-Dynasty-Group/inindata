const crypto = require('node:crypto');
const { requireAuth, requirePermission } = require('../lib/auth');
const { json, readBody, unauthorized } = require('../lib/json');
const pagination = require('../api/pagination');
const cache = require('../api/cache');
const storage = require('../db/storage');
const email = require('../email/service');

function write(data) { storage.write(data); }

function audit(data, action, resourceType, resourceId, metadata = {}) {
  data.auditLogs.unshift({ id: crypto.randomUUID(), action, resourceType, resourceId, actor: 'local-admin', timestamp: new Date().toISOString(), metadata });
}

function isVisible(question, answers) {
  if (!question.visibleWhen) return true;
  const actual = answers[question.visibleWhen.fieldKey];
  const values = Array.isArray(actual) ? actual : [actual];
  return values.map(value => String(value)).includes(String(question.visibleWhen.value));
}

function validateSubmission(version, answers) {
  const errors = {};
  version.sections.flatMap(s => s.questions).forEach(q => {
    if (!isVisible(q, answers)) return;
    const value = answers[q.key];
    const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);
    if (q.required && empty) errors[q.key] = 'This question is required.';
    if (empty) return;
    if (q.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) errors[q.key] = 'Enter a valid number.';
    if (q.type === 'yesNo' && typeof value !== 'boolean') errors[q.key] = 'Select Yes or No.';
    if (['singleSelect', 'multiSelect'].includes(q.type)) {
      const values = Array.isArray(value) ? value : [value];
      if (values.some(v => !q.options.includes(v))) errors[q.key] = 'Choose a listed option.';
    }
  });
  return errors;
}

const getInstrument = async (req, res, data, params) => {
  const item = data.instruments.find(x => x.collectionToken === params.token && x.status === 'published');
  if (!item) return json(res, 404, { error: 'This collection link is unavailable.' });
  const version = item.versions.at(-1);
  return json(res, 200, { instrumentId: item.id, name: item.name, version: version.version, sections: version.sections });
};

const submit = async (req, res, data, params) => {
  const item = data.instruments.find(x => x.collectionToken === params.token && x.status === 'published');
  if (!item) return json(res, 404, { error: 'This collection link is unavailable.' });
  const body = await readBody(req);
  const version = item.versions.at(-1);
  const errors = validateSubmission(version, body.answers || {});
  if (Object.keys(errors).length) return json(res, 422, { error: 'Please correct the highlighted answers.', fields: errors });
  const submission = { id: crypto.randomUUID(), instrumentId: item.id, instrumentVersion: version.version, status: 'submitted', answers: body.answers, submittedAt: new Date().toISOString() };
  data.submissions.push(submission);
  audit(data, 'CREATE', 'submission', submission.id, { instrumentId: item.id, version: version.version });
  write(data);
  cache.invalidateAnalyticsCache(item.id);

  if (email.ENABLED && body.respondentEmail) {
    email.sendEmail(
      body.respondentEmail,
      `Thank you for your response to "${item.name}"`,
      `Your response has been received (ID: ${submission.id}). Thank you for your participation.`,
      `<h2>Thank you for your response</h2><p>Your response to <strong>"${item.name}"</strong> has been received.</p><p><strong>Submission ID:</strong> ${submission.id}</p>`
    ).catch(err => console.error('[Email] Failed to send submission confirmation:', err.message));
  }

  return json(res, 201, { id: submission.id, status: submission.status });
};

module.exports = { getInstrument, submit };
