const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const handler = require('../server');

let server;
let port;

function request(method, path, body = null, cookie = '') {
  return new Promise((resolve, reject) => {
    const options = {
      method,
      hostname: 'localhost',
      port,
      path,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { 'Cookie': cookie } : {})
      }
    };
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function getCookie(res) {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return '';
  const match = setCookie.find(c => c.startsWith('fieldwork_session='));
  return match ? match.split(';')[0] : '';
}

function uniqueEmail(label) {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.example.com`;
}

async function signupAndGetCookie(email) {
  const res = await request('POST', '/api/auth/signup', {
    orgName: 'Test Org',
    email: email,
    password: 'testpassword123',
    confirmPassword: 'testpassword123'
  });
  return { cookie: getCookie(res), response: res };
}

test.before(async () => {
  server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, resolve));
  port = server.address().port;
});

test.after(() => { server.close(); });

// ── Health ──

test('GET /api/health returns ok', async () => {
  const res = await request('GET', '/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

test('GET /api/health/db returns database info', async () => {
  const res = await request('GET', '/api/health/db');
  assert.equal(res.status, 200);
  assert.ok(res.body.itemsbase || res.body.status);
});

// ── Security headers ──

test('response includes security headers', async () => {
  const res = await request('GET', '/api/health');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-frame-options'], 'DENY');
});

// ── Static files ──

test('GET / serves index.html', async () => {
  const res = await request('GET', '/');
  assert.equal(res.status, 200);
  assert.ok(typeof res.body === 'string');
  assert.ok(res.body.includes('Fieldwork'));
});

test('GET /nonexistent returns 404', async () => {
  const res = await request('GET', '/nonexistent');
  assert.equal(res.status, 404);
});

// ── Auth signup ──

test('POST /api/auth/signup creates a new user', async () => {
  const email = uniqueEmail('signup');
  const res = await request('POST', '/api/auth/signup', {
    orgName: 'Signup Test',
    email,
    password: 'testpassword123',
    confirmPassword: 'testpassword123'
  });
  assert.equal(res.status, 201);
  assert.ok(res.body.user);
  assert.equal(res.body.user.email, email);
});

test('POST /api/auth/signup with duplicate email returns 409', async () => {
  const email = uniqueEmail('dupe');
  await request('POST', '/api/auth/signup', {
    orgName: 'Dupe Test',
    email,
    password: 'testpassword123',
    confirmPassword: 'testpassword123'
  });
  const res = await request('POST', '/api/auth/signup', {
    orgName: 'Dupe Test 2',
    email,
    password: 'testpassword123',
    confirmPassword: 'testpassword123'
  });
  assert.equal(res.status, 409);
});

test('POST /api/auth/signup with short password returns 422', async () => {
  const res = await request('POST', '/api/auth/signup', {
    orgName: 'Short PW',
    email: uniqueEmail('shortpw'),
    password: 'short',
    confirmPassword: 'short'
  });
  assert.equal(res.status, 422);
});

test('POST /api/auth/signup with mismatched passwords returns 422', async () => {
  const res = await request('POST', '/api/auth/signup', {
    orgName: 'Mismatch',
    email: uniqueEmail('mismatch'),
    password: 'testpassword123',
    confirmPassword: 'differentpassword'
  });
  assert.equal(res.status, 422);
});

// ── Auth session flow ──

test('GET /api/me after signup returns the user', async () => {
  const email = uniqueEmail('me');
  const { cookie } = await signupAndGetCookie(email);
  const res = await request('GET', '/api/me', null, cookie);
  assert.equal(res.status, 200);
  assert.ok(res.body.user);
  assert.equal(res.body.user.email, email);
});

test('GET /api/me without auth returns 401', async () => {
  const res = await request('GET', '/api/me');
  assert.equal(res.status, 401);
});

test('POST /api/auth/logout returns 204', async () => {
  const { cookie } = await signupAndGetCookie(uniqueEmail('logout'));
  const res = await request('POST', '/api/auth/logout', null, cookie);
  assert.equal(res.status, 204);
});

test('POST /api/auth/login with invalid credentials returns 401', async () => {
  const res = await request('POST', '/api/auth/login', {
    email: 'nonexistent@example.com',
    password: 'wrongpassword123'
  });
  assert.equal(res.status, 401);
});

// ── Password reset ──

test('POST /api/auth/password-reset returns success message', async () => {
  const email = uniqueEmail('reset');
  await signupAndGetCookie(email);
  const res = await request('POST', '/api/auth/password-reset', { email });
  assert.equal(res.status, 200);
  assert.ok(res.body.message);
});

test('POST /api/auth/password-reset/confirm with invalid token returns 401', async () => {
  const res = await request('POST', '/api/auth/password-reset/confirm', {
    token: 'invalid-token',
    password: 'newpassword12345'
  });
  assert.equal(res.status, 401);
});

// ── Instruments ──

test('POST /api/instruments creates a draft', async () => {
  const { cookie } = await signupAndGetCookie(uniqueEmail('create-inst'));
  const res = await request('POST', '/api/instruments', { name: 'Test Form' }, cookie);
  assert.equal(res.status, 201);
  assert.ok(res.body.id);
  assert.equal(res.body.name, 'Test Form');
  assert.equal(res.body.status, 'draft');
});

test('GET /api/instruments lists instruments', async () => {
  const { cookie } = await signupAndGetCookie(uniqueEmail('list-inst'));
  await request('POST', '/api/instruments', { name: 'Listed Form' }, cookie);
  const res = await request('GET', '/api/instruments', null, cookie);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.items));
});

test('GET /api/instruments/:id returns a specific instrument', async () => {
  const { cookie } = await signupAndGetCookie(uniqueEmail('get-inst'));
  const createRes = await request('POST', '/api/instruments', { name: 'Get Form' }, cookie);
  const id = createRes.body.id;
  const res = await request('GET', `/api/instruments/${id}`, null, cookie);
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Get Form');
});

test('PUT /api/instruments/:id updates a draft', async () => {
  const { cookie } = await signupAndGetCookie(uniqueEmail('upd-inst'));
  const createRes = await request('POST', '/api/instruments', { name: 'Update Form' }, cookie);
  const id = createRes.body.id;
  const res = await request('PUT', `/api/instruments/${id}`, {
    name: 'Updated Form',
    sections: [{ id: 's1', title: 'Section 1', description: '', questions: [] }]
  }, cookie);
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Updated Form');
});

// ── Dashboard ──

test('GET /api/dashboard returns real metrics', async () => {
  const { cookie } = await signupAndGetCookie(uniqueEmail('dash'));
  const res = await request('GET', '/api/dashboard', null, cookie);
  assert.equal(res.status, 200);
  assert.ok(res.body.metrics);
  assert.equal(typeof res.body.metrics.totalResponses, 'number');
  assert.equal(typeof res.body.metrics.activeForms, 'number');
  assert.equal(typeof res.body.metrics.pendingReviews, 'number');
});

test('GET /api/dashboard without auth returns 401', async () => {
  const res = await request('GET', '/api/dashboard');
  assert.equal(res.status, 401);
});

// ── Users ──

test('GET /api/users lists users', async () => {
  const { cookie } = await signupAndGetCookie(uniqueEmail('users'));
  const res = await request('GET', '/api/users', null, cookie);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.items));
  assert.ok(res.body.items.length >= 1);
});

// ── Collect (public) ──

test('GET /api/collect with invalid token returns 404', async () => {
  const res = await request('GET', '/api/collect/invalid-token');
  assert.equal(res.status, 404);
});

// ── Organization ──

test('GET /api/organization returns org info', async () => {
  const { cookie } = await signupAndGetCookie(uniqueEmail('org'));
  const res = await request('GET', '/api/organization', null, cookie);
  assert.equal(res.status, 200);
  assert.ok(res.body.name);
});

// ── Programs ──

test('GET /api/programs lists programs', async () => {
  const { cookie } = await signupAndGetCookie(uniqueEmail('prog'));
  const res = await request('GET', '/api/programs', null, cookie);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.items));
});

// ── Reports ──

test('GET /api/reports lists reports', async () => {
  const { cookie } = await signupAndGetCookie(uniqueEmail('rpt'));
  const res = await request('GET', '/api/reports', null, cookie);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.items));
});

// ── Dashboards ──

test('GET /api/dashboards lists dashboards', async () => {
  const { cookie } = await signupAndGetCookie(uniqueEmail('dashbrd'));
  const res = await request('GET', '/api/dashboards', null, cookie);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.items));
});

// ── Audit logs ──

test('GET /api/audit-logs lists audit logs', async () => {
  const { cookie } = await signupAndGetCookie(uniqueEmail('audit'));
  const res = await request('GET', '/api/audit-logs', null, cookie);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.items));
});
