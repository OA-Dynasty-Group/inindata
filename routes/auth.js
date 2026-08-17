const crypto = require('node:crypto');
const supabaseAuth = require('../db/supabase-client');
const { json, readBody, unauthorized } = require('../lib/json');
const { rateLimit } = require('../lib/security');
const storage = require('../db/storage');
const email = require('../email/service');

const sessions = new Map();

function audit(data, action, resourceType, resourceId, metadata = {}) {
  data.auditLogs.unshift({
    id: crypto.randomUUID(),
    action,
    resourceType,
    resourceId,
    actor: 'local-admin',
    timestamp: new Date().toISOString(),
    metadata
  });
}

function write(data) {
  storage.write(data);
}

function cookie(req, name) {
  return (req.headers.cookie || '').split(';').map(v => v.trim().split('=')).find(([key]) => key === name)?.[1];
}

function publicUser(user) {
  const { password, ...safe } = user;
  return safe;
}

async function signup(req, res, data) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
  if (!rateLimit(`signup:${ip}`, 20, 15 * 60 * 1000)) {
    return json(res, 429, { error: 'Too many requests. Please try again later.' });
  }
  const body = await readBody(req);
  const orgName = String(body.orgName || '').trim();
  const userEmail = String(body.email || '').trim().toLowerCase();
  const safeEmail = userEmail.replace(/[^\w.@+-]/g, '');
  const password = String(body.password || '').trim();
  const confirmPassword = String(body.confirmPassword || '').trim();

  if (!orgName || orgName.length < 2) return json(res, 422, { error: 'Organization name must be at least 2 characters.' });
  if (!/^\S+@\S+\.\S+$/.test(safeEmail)) return json(res, 422, { error: 'Provide a valid email address.' });
  if (password.length < 12) return json(res, 422, { error: 'Password must be at least 12 characters.' });
  if (password !== confirmPassword) return json(res, 422, { error: 'Passwords do not match.' });

  const existingUser = data.users?.find(u => u.email === safeEmail);
  if (existingUser) return json(res, 409, { error: 'An account with this email already exists.' });

  try {
    if (storage.USE_SUPABASE) {
      const authResult = await supabaseAuth.signUp(safeEmail, password, { orgName });
      const authUser = authResult.user;

      const org = { id: crypto.randomUUID(), name: orgName, createdAt: new Date().toISOString() };
      if (!data.organization) {
        data.organization = org;
      }

      const user = {
        id: crypto.randomUUID(),
        supabaseUserId: authUser.id,
        name: body.name?.trim() || safeEmail.split('@')[0],
        email: safeEmail,
        status: 'active',
        roles: ['admin'],
        permissions: storage.ADMIN_PERMS_ARRAY,
        createdAt: new Date().toISOString()
      };
      if (!data.users) data.users = [];
      data.users.push(user);

      const roleAssignment = { userId: user.id, role: 'admin', permissions: storage.ADMIN_PERMS_ARRAY };
      if (!data.roles) data.roles = {};
      if (!data.roles.admin) data.roles.admin = { permissions: storage.ADMIN_PERMS_ARRAY };
      if (!data.userRoles) data.userRoles = [];
      data.userRoles.push(roleAssignment);

      audit(data, 'SIGNUP', 'user', user.id, { email: user.email, orgName });
      write(data);

      if (authResult.session) {
        supabaseAuth.setAuthCookie(res, authResult.session.access_token);
      }

      return json(res, 201, { user: publicUser(user), message: 'Account created. Please check your email for verification.' });
    } else {
      const user = {
        id: crypto.randomUUID(),
        name: body.name?.trim() || safeEmail.split('@')[0],
        email: safeEmail,
        status: 'active',
        roles: ['admin'],
        permissions: storage.ADMIN_PERMS_ARRAY,
        password: storage.passwordHash(password),
        createdAt: new Date().toISOString()
      };
      if (!data.users) data.users = [];
      data.users.push(user);
      audit(data, 'SIGNUP', 'user', user.id, { email: user.email, orgName });
      write(data);

      const token = crypto.randomBytes(32).toString('base64url');
      sessions.set(token, user.id);
      res.writeHead(201, {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': `fieldwork_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`,
        'Cache-Control': 'no-store'
      });
      return res.end(JSON.stringify({ user: publicUser(user) }));
    }
  } catch (err) {
    console.error('[Auth] Signup error:', err.message);
    return json(res, 400, { error: err.message || 'Failed to create account.' });
  }
}

async function login(req, res, data) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
  if (!rateLimit(`login:${ip}`, 50, 15 * 60 * 1000)) {
    return json(res, 429, { error: 'Too many requests. Please try again later.' });
  }

  const body = await readBody(req);
  const emailAddr = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '').trim();

  if (!emailAddr || !password) return json(res, 422, { error: 'Email and password are required.' });

  try {
    if (storage.USE_SUPABASE) {
      const authResult = await supabaseAuth.signIn(emailAddr, password);
      const authUser = authResult.user;

      let fwUser = data.users?.find(u => u.supabaseUserId === authUser.id && u.status === 'active');
      if (!fwUser) fwUser = data.users?.find(u => u.email === authUser.email && u.status === 'active');
      if (!fwUser) {
        fwUser = {
          id: crypto.randomUUID(),
          supabaseUserId: authUser.id,
          name: authUser.user_metadata?.full_name || authUser.email.split('@')[0],
          email: authUser.email,
          status: 'active',
          roles: ['admin'],
          permissions: storage.ADMIN_PERMS_ARRAY,
          createdAt: new Date().toISOString()
        };
        if (!data.users) data.users = [];
        data.users.push(fwUser);
        audit(data, 'LOGIN_PROVISION', 'user', fwUser.id, { email: fwUser.email, source: 'supabase-jit' });
        write(data);
      }

      if (!fwUser.supabaseUserId) fwUser.supabaseUserId = authUser.id;

      supabaseAuth.setAuthCookie(res, authResult.session.access_token);

      return json(res, 200, { user: publicUser(fwUser) });
    } else {
      const user = data.users?.find(item => item.email.toLowerCase() === emailAddr && item.status === 'active');
      if (!user || !storage.passwordsMatch(password, user)) return json(res, 401, { error: 'The email or password is incorrect.' });
      const token = crypto.randomBytes(32).toString('base64url');
      sessions.set(token, user.id);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': `fieldwork_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`,
        'Cache-Control': 'no-store'
      });
      return res.end(JSON.stringify({ user: publicUser(user) }));
    }
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    return json(res, 401, { error: 'The email or password is incorrect.' });
  }
}

async function logout(req, res) {
  try {
    if (storage.USE_SUPABASE) {
      const jwt = supabaseAuth.parseAuthCookie(req.headers);
      if (jwt) await supabaseAuth.signOut(jwt);
      supabaseAuth.clearAuthCookie(res);
    } else {
      const token = cookie(req, 'fieldwork_session');
      if (token) sessions.delete(token);
      res.writeHead(204, { 'Set-Cookie': 'fieldwork_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
    }
    return res.end();
  } catch (err) {
    return res.end();
  }
}

async function me(req, res, data) {
  const { currentUser } = require('../lib/auth');
  const user = await currentUser(req, data);
  return user ? json(res, 200, { user: publicUser(user) }) : unauthorized(res);
}

async function passwordReset(req, res, data) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
  if (!rateLimit(`passwordReset:${ip}`, 3, 15 * 60 * 1000)) {
    return json(res, 429, { error: 'Too many requests. Please try again later.' });
  }

  const body = await readBody(req);
  const userEmail = String(body.email || '').trim().toLowerCase();
  if (!userEmail || !/^\S+@\S+\.\S+$/.test(userEmail)) return json(res, 422, { error: 'Provide a valid email address.' });

  try {
    if (storage.USE_SUPABASE) {
      await supabaseAuth.resetPassword(userEmail);
    } else {
      const user = data.users?.find(u => u.email === userEmail);
      if (!user) return json(res, 404, { error: 'No account found with this email address.' });
      const resetToken = crypto.randomBytes(32).toString('base64url');
      const resetTokenExpiry = Date.now() + 3600000;
      user.passwordResetToken = resetToken;
      user.passwordResetExpiry = resetTokenExpiry;
      audit(data, 'PASSWORD_RESET_REQUEST', 'user', user.id, { email: user.email });
      write(data);
      const resetUrl = `${process.env.FIELDWORK_PUBLIC_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;
      if (email.ENABLED) {
        email.sendEmail(user.email, email.templates.passwordReset(user.name, resetUrl).subject, email.templates.passwordReset(user.name, resetUrl).text, email.templates.passwordReset(user.name, resetUrl).html).catch(err => console.error('[Email] Failed to send password reset:', err.message));
      }
    }
    return json(res, 200, { message: 'Password reset instructions have been sent to your email.' });
  } catch (err) {
    return json(res, 200, { message: 'Password reset instructions have been sent to your email.' });
  }
}

async function passwordResetConfirm(req, res, data) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
  if (!rateLimit(`passwordResetConfirm:${ip}`, 5, 15 * 60 * 1000)) {
    return json(res, 429, { error: 'Too many requests. Please try again later.' });
  }

  const body = await readBody(req);
  const token = String(body.token || '').trim();
  const newPassword = String(body.password || '').trim();
  if (newPassword.length < 12) return json(res, 422, { error: 'Password must be at least 12 characters.' });

  try {
    if (storage.USE_SUPABASE) {
      await supabaseAuth.updateUserPassword(token, newPassword);
      return json(res, 200, { message: 'Password has been reset successfully.' });
    } else {
      const user = data.users?.find(u => u.passwordResetToken === token && u.passwordResetExpiry > Date.now());
      if (!user) return json(res, 401, { error: 'Reset link is invalid or has expired.' });
      user.password = storage.passwordHash(newPassword);
      delete user.passwordResetToken;
      delete user.passwordResetExpiry;
      audit(data, 'PASSWORD_RESET_COMPLETE', 'user', user.id, {});
      write(data);
      return json(res, 200, { message: 'Password has been reset successfully.' });
    }
  } catch (err) {
    return json(res, 401, { error: 'Reset link is invalid or has expired.' });
  }
}

module.exports = {
  signup,
  login,
  logout,
  me,
  passwordReset,
  passwordResetConfirm,
  sessions
};
