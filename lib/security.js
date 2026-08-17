const rateLimits = new Map();

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

function rateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  let entry = rateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    rateLimits.set(key, entry);
  }
  entry.count++;
  return entry.count <= maxRequests;
}

const ALLOWED_EXTENSIONS = new Set([
  '.html', '.css', '.js', '.json',
  '.png', '.jpg', '.jpeg', '.svg', '.ico',
  '.woff2', '.woff', '.ttf', '.gif'
]);

function isAllowedFile(pathname) {
  const ext = require('node:path').extname(pathname).toLowerCase();
  return !ext || ALLOWED_EXTENSIONS.has(ext);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { securityHeaders, rateLimit, isAllowedFile, escapeHtml };
