// db/supabase-client.js
// Supabase REST API client for serverless deployment (Vercel + Supabase free tier)
// This is lighter and better for serverless than maintaining persistent PostgreSQL connections

const { createClient } = require('@supabase/supabase-js');

// Validate environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Create Supabase client (REST API via HTTP) - only if configured
const supabase = HAS_SUPABASE ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

/**
 * Supabase query builder - mimics the pg-pool interface
 * Returns a Promise that resolves to { rows } or rejects with error
 */
class SupabaseQueryBuilder {
  constructor(query, values = []) {
    this.query = query;
    this.values = values;
  }

  async execute() {
    // This is a simplified implementation
    // In production, you would map SQL queries to Supabase PostgREST calls
    // For now, we'll use Supabase's SQL capabilities
    
    try {
      const { data, error } = await supabase.rpc('execute_sql', {
        sql_query: this.query,
        params: this.values
      });

      if (error) throw error;
      return { rows: data || [] };
    } catch (err) {
      throw new Error(`Supabase query failed: ${err.message}`);
    }
  }

  // Support both callback and Promise interfaces
  then(onFulfilled, onRejected) {
    return this.execute().then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    return this.execute().catch(onRejected);
  }
}

/**
 * Query builder with better Supabase integration
 * Uses PostgREST API for common operations
 */
const queries = {
  // User queries
  getUserByEmail: (email) => ({
    async execute() {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return { rows: data ? [data] : [] };
    },
    then(f1, f2) { return this.execute().then(f1, f2); },
    catch(f) { return this.execute().catch(f); }
  }),

  getUserById: (userId) => ({
    async execute() {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return { rows: data ? [data] : [] };
    },
    then(f1, f2) { return this.execute().then(f1, f2); },
    catch(f) { return this.execute().catch(f); }
  }),

  getAllUsers: () => ({
    async execute() {
      const { data, error } = await supabase.from('users').select('*');
      if (error) throw error;
      return { rows: data || [] };
    },
    then(f1, f2) { return this.execute().then(f1, f2); },
    catch(f) { return this.execute().catch(f); }
  }),

  // Session queries
  getSessionByToken: (token) => ({
    async execute() {
      const { data, error } = await supabase
        .from('auth_sessions')
        .select('*')
        .eq('token', token)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return { rows: data ? [data] : [] };
    },
    then(f1, f2) { return this.execute().then(f1, f2); },
    catch(f) { return this.execute().catch(f); }
  }),

  // Generic query method for complex operations
  query: (text, values) => new SupabaseQueryBuilder(text, values)
};

/**
 * Database connection pool interface (mimics pg-pool)
 */
const pool = {
  query: (text, values) => queries.query(text, values),
  connect: async () => ({ release: () => {} }), // No-op for serverless
  end: async () => {}, // No-op for serverless
  on: () => {} // No-op for events
};

/**
 * Auth helpers for Supabase Auth integration
 */
const AUTH_COOKIE_NAME = 'fieldwork_token';
const AUTH_COOKIE_MAX_AGE = 60 * 60; // 1 hour

/**
 * Create a Supabase client authenticated as a specific user (with their JWT)
 * Used for operations that need to run as the authenticated user
 */
function createAuthenticatedClient(accessToken) {
  if (!HAS_SUPABASE) throw new Error('Supabase is not configured');
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  });
}

function signUp(email, password, metadata = {}) {
  if (!HAS_SUPABASE) return Promise.reject(new Error('Supabase is not configured'));
  return supabase.auth.signUp({
    email,
    password,
    options: { data: metadata }
  }).then(({ data, error }) => {
    if (error) throw error;
    return data;
  });
}

function signIn(email, password) {
  if (!HAS_SUPABASE) return Promise.reject(new Error('Supabase is not configured'));
  return supabase.auth.signInWithPassword({
    email,
    password
  }).then(({ data, error }) => {
    if (error) throw error;
    return data;
  });
}

function signOut(accessToken) {
  if (!HAS_SUPABASE) return Promise.resolve();
  const client = createAuthenticatedClient(accessToken);
  return client.auth.signOut().then(({ error }) => {
    if (error) throw error;
  });
}

function getUser(accessToken) {
  if (!HAS_SUPABASE) return Promise.resolve({ user: null });
  const client = createAuthenticatedClient(accessToken);
  return client.auth.getUser().then(({ data, error }) => {
    if (error) throw error;
    return data;
  });
}

function resetPassword(email) {
  if (!HAS_SUPABASE) return Promise.reject(new Error('Supabase is not configured'));
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.APP_URL || 'https://fieldwork.inindata.com'}/reset-password`
  }).then(({ error }) => {
    if (error) throw error;
  });
}

function updateUserPassword(accessToken, newPassword) {
  if (!HAS_SUPABASE) return Promise.reject(new Error('Supabase is not configured'));
  const client = createAuthenticatedClient(accessToken);
  return client.auth.updateUser({
    password: newPassword
  }).then(({ data, error }) => {
    if (error) throw error;
    return data;
  });
}

/**
 * Set auth cookie on response
 */
function setAuthCookie(res, accessToken) {
  const cookie = `${AUTH_COOKIE_NAME}=${accessToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${AUTH_COOKIE_MAX_AGE}`;
  res.setHeader('Set-Cookie', cookie);
}

/**
 * Clear auth cookie on response
 */
function clearAuthCookie(res) {
  const cookie = `${AUTH_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
  res.setHeader('Set-Cookie', cookie);
}

/**
 * Parse auth cookie from request headers
 */
function parseAuthCookie(headers) {
  const cookieHeader = headers.cookie || '';
  const cookies = cookieHeader.split(';').map(c => c.trim());
  const authCookie = cookies.find(c => c.startsWith(`${AUTH_COOKIE_NAME}=`));
  if (!authCookie) return null;
  return authCookie.split('=')[1];
}

module.exports = {
  pool,
  queries,
  supabase,
  AUTH_COOKIE_NAME,
  createAuthenticatedClient,
  signUp,
  signIn,
  signOut,
  getUser,
  resetPassword,
  updateUserPassword,
  setAuthCookie,
  clearAuthCookie,
  parseAuthCookie
};
