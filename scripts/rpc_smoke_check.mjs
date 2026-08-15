import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or SUPABASE_URL/SUPABASE_ANON_KEY) in env');
  process.exit(1);
}

const client = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  try {
    console.log('Calling rpc_group_finance_summary (sample)...');
    const { data, error } = await client.rpc('rpc_group_finance_summary', { p_group_id: 1, p_period_id: null, p_as_of_date: null });
    if (error) {
      console.error('RPC error:', error);
      process.exit(2);
    }
    console.log('RPC result:', data);
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(3);
  }
}

run();
