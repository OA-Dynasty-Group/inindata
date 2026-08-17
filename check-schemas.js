const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
  // Check schemas
  const { data: schemas, error: se } = await supabase.rpc('execute_sql', {
    sql_query: "SELECT schema_name FROM information_schema.schemata;"
  });
  console.log('Schemas:', JSON.stringify(schemas, null, 2));
  if (se) console.error('Schema error:', se);

  // Check tables in all schemas
  const { data: tables, error: te } = await supabase.rpc('execute_sql', {
    sql_query: "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('information_schema', 'pg_catalog');"
  });
  console.log('Tables:', JSON.stringify(tables, null, 2));
  if (te) console.error('Tables error:', te);
}

check();