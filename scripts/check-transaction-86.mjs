import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) {
    env[match[1].trim()] = match[2].trim();
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkTransaction86() {
  try {
    console.log('🔍 Checking Ajinkya More (member_id=57) and Transaction ID=86\n');

    // Query all transactions for member 57
    const { data: allTransactions, error: allError } = await supabase
      .from('member_transaction_header')
      .select('member_trx_id, trx_number, trx_date, trx_type, total_amount, approval_status, reversed_flag, parent_trx_id')
      .eq('member_id', 57)
      .order('trx_date', { ascending: false });

    if (allError) {
      throw new Error(`Query failed: ${allError.message}`);
    }

    console.log(`📊 Total transactions for Ajinkya (ID 57): ${allTransactions.length}\n`);
    
    // Calculate 60 days ago
    const today = new Date();
    const sixtyDaysAgo = new Date(today);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const sixtyDaysAgoStr = sixtyDaysAgo.toISOString().split('T')[0];

    console.log(`📅 Today: ${today.toISOString().split('T')[0]}`);
    console.log(`📅 60 days ago: ${sixtyDaysAgoStr}\n`);

    // Check each transaction
    console.log('📋 Transaction details:\n');
    allTransactions.forEach((trx, idx) => {
      const isOlderThan60Days = String(trx.trx_date) < sixtyDaysAgoStr;
      const isCompleted = trx.approval_status === 'Completed' || trx.approval_status === 'COMPLETED';
      const isReversal = String(trx.reversed_flag).toUpperCase() === 'Y' || String(trx.trx_number || '').startsWith('REV');
      const willShowInUI = !isOlderThan60Days || !isCompleted;
      
      console.log(`${idx + 1}. ID=${trx.member_trx_id}, Date=${trx.trx_date}, Type=${trx.trx_type}`);
      console.log(`   Amount: ₹${trx.total_amount}, Status: ${trx.approval_status}`);
      console.log(`   Reversal: ${isReversal}, Parent ID: ${trx.parent_trx_id || 'None'}`);
      console.log(`   Older than 60 days? ${isOlderThan60Days}`);
      console.log(`   Will show in UI? ${willShowInUI}`);
      console.log();
    });

    // Specific check for ID=86
    const trx86 = allTransactions.find(t => t.member_trx_id === 86);
    if (trx86) {
      const isOlderThan60Days = String(trx86.trx_date) < sixtyDaysAgoStr;
      console.log(`\n🎯 TRANSACTION ID=86 ROOT CAUSE:\n`);
      console.log(`   ID: 86`);
      console.log(`   Date: ${trx86.trx_date}`);
      console.log(`   Is older than 60 days? ${isOlderThan60Days} (visible in 60-day filter: ${!isOlderThan60Days})`);
      console.log(`   Status: ${trx86.approval_status}`);
      console.log(`   Type: ${trx86.trx_type}`);
      console.log(`   Amount: ₹${trx86.total_amount}`);
      
      if (isOlderThan60Days) {
        console.log(`\n✅ ROOT CAUSE CONFIRMED: Transaction ID=86 is OLDER than 60 days`);
        console.log(`   This transaction is hidden from the UI but still counted in calculations`);
      } else {
        console.log(`\n❌ Transaction ID=86 is NOT older than 60 days`);
        console.log(`   There's a different reason it's not showing in the UI`);
      }
    } else {
      console.log('\n❌ Transaction ID=86 not found');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkTransaction86();
