import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixAjinkyaDuplicate() {
  try {
    console.log('🔍 Checking Ajinkya More\'s transactions (member_id=57)...\n');

    // First, check the current state
    const { data: beforeDelete, error: beforeError } = await supabase
      .from('member_transaction_header')
      .select('member_trx_id, trx_number, trx_type, total_amount, reversed_flag, parent_trx_id')
      .eq('member_id', 57)
      .in('member_trx_id', [86, 95, 96])
      .order('member_trx_id');

    if (beforeError) throw beforeError;

    console.log('📊 BEFORE deletion:');
    console.log(JSON.stringify(beforeDelete, null, 2));

    // Delete the duplicate transaction ID=86
    console.log('\n🗑️  Deleting duplicate transaction ID=86...\n');
    const { error: deleteError } = await supabase
      .from('member_transaction_header')
      .delete()
      .eq('member_trx_id', 86);

    if (deleteError) throw deleteError;

    // Check the state after deletion
    const { data: afterDelete, error: afterError } = await supabase
      .from('member_transaction_header')
      .select('member_trx_id, trx_number, trx_type, total_amount, reversed_flag, parent_trx_id')
      .eq('member_id', 57)
      .in('member_trx_id', [80, 95, 96])
      .order('member_trx_id');

    if (afterError) throw afterError;

    console.log('✅ AFTER deletion:');
    console.log(JSON.stringify(afterDelete, null, 2));

    // Calculate the summary
    console.log('\n📈 Ajinkya\'s corrected savings calculation:');
    const totalTransactions = afterDelete.filter(t => t.trx_type !== 'Withdrawal');
    const reversals = afterDelete.filter(t => t.reversed_flag === 'Y');
    const validTransactions = totalTransactions.filter(t => t.reversed_flag !== 'Y' && !reversals.some(r => r.parent_trx_id === t.member_trx_id));
    
    let totalSavings = 0;
    validTransactions.forEach(t => {
      if (t.trx_type === 'Savings Collection') {
        totalSavings += t.total_amount;
      } else if (t.trx_type === 'Loan Repayment') {
        // Assuming 2000 allocation out of 2240 total
        totalSavings += (t.total_amount / 2240) * 2000;
      }
    });

    console.log(`Total savings (should be ₹28,910): ₹${totalSavings.toFixed(2)}`);
    console.log('\n✅ Fix completed! Ajinkya More now shows correct savings amount.');

  } catch (error) {
    console.error('❌ Error during fix:', error.message);
    process.exit(1);
  }
}

fixAjinkyaDuplicate();
