// db/supabase-client.js
// Supabase REST API client for serverless deployment (Vercel + Supabase free tier)
// This is lighter and better for serverless than maintaining persistent PostgreSQL connections

const { createClient } = require('@supabase/supabase-js');

// Validate environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
}

// Create Supabase client (REST API via HTTP)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

module.exports = {
  pool,
  queries,
  supabase
};
