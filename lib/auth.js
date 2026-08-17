const supabaseAuth = require('../db/supabase-client');
const crypto = require('node:crypto');
const storage = require('../db/storage');

function parseCookie(headers, name) {
  return (headers.cookie || '').split(';').map(v => v.trim().split('=')).find(([key]) => key === name)?.[1];
}

async function currentUser(req, data) {
  const jwt = supabaseAuth.parseAuthCookie(req.headers);
  if (jwt) {
    try {
      const { user } = await supabaseAuth.getUser(jwt);
      if (user) {
        const fwUser = data.users?.find(u => u.supabaseUserId === user.id && u.status === 'active');
        if (fwUser) return fwUser;
        const byEmail = data.users?.find(u => u.email === user.email && u.status === 'active');
        if (byEmail) {
          byEmail.supabaseUserId = user.id;
          return byEmail;
        }
        if (storage.USE_SUPABASE) {
          const provisioned = {
            id: crypto.randomUUID(),
            supabaseUserId: user.id,
            name: user.user_metadata?.full_name || user.email.split('@')[0],
            email: user.email,
            status: 'active',
            roles: ['admin'],
            permissions: storage.ADMIN_PERMS_ARRAY,
            createdAt: new Date().toISOString()
          };
          if (!data.users) data.users = [];
          data.users.push(provisioned);
          storage.write(data);
          return provisioned;
        }
      }
    } catch {}
  }
  const token = parseCookie(req.headers, 'fieldwork_session');
  if (!token) return null;
  const sessions = req._sessions;
  if (!sessions) return null;
  const id = sessions.get(token);
  return data.users?.find(u => u.id === id && u.status === 'active') || null;
}

function requireAuth(handler) {
  return async (req, res, data, params) => {
    const user = await currentUser(req, data);
    if (!user) {
      const { unauthorized } = require('./json');
      return unauthorized(res);
    }
    req.user = user;
    return handler(req, res, data, params);
  };
}

function requirePermission(permission, handler) {
  return requireAuth(async (req, res, data, params) => {
    if (!req.user.permissions.includes(permission)) {
      const { unauthorized } = require('./json');
      return unauthorized(res);
    }
    return handler(req, res, data, params);
  });
}

module.exports = { currentUser, requireAuth, requirePermission, parseCookie };
