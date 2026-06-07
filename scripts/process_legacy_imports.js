#!/usr/bin/env node
// Simple script to invoke the DB RPC that processes legacy imports.
// Usage: SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/process_legacy_imports.js [batchSize]

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Please set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_ variants) in the environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const batchSize = Number(process.argv[2] || 100);

(async () => {
  try {
    const { data, error } = await supabase.rpc('process_legacy_member_imports', { batch_size: batchSize });
    if (error) throw error;
    console.log('Processed imports:', data);
    process.exit(0);
  } catch (err) {
    console.error('Error processing imports:', err.message || err);
    process.exit(2);
  }
})();
