import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const client = createClient(supabaseUrl, supabaseKey);

async function debug() {
  // Get all Interest Collection transactions
  const { data: transactions, error } = await client
    .from("member_transaction_header")
    .select("id,member_id,amount,transaction_type,approval_status,transaction_date,created_at")
    .eq("transaction_type", "Interest Collection")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Error fetching transactions:", error);
    return;
  }

  console.log("=== Interest Collection Transactions ===\n");
  if (!transactions || transactions.length === 0) {
    console.log("No Interest Collection transactions found.\n");
    return;
  }

  for (const trx of transactions) {
    console.log(`\nTransaction ID: ${trx.id}`);
    console.log(`Member ID: ${trx.member_id}`);
    console.log(`Amount: ${trx.amount}`);
    console.log(`Type: ${trx.transaction_type}`);
    console.log(`Status: ${trx.approval_status}`);
    console.log(`Date: ${trx.transaction_date}`);
    console.log(`Created: ${trx.created_at}`);

    // Get the allocation lines for this transaction
    const { data: lines, error: linesError } = await client
      .from("member_transaction_lines")
      .select("line_type,amount")
      .eq("member_trx_id", trx.id);

    if (linesError) {
      console.log(`  Error fetching lines: ${linesError.message}`);
    } else {
      console.log("  Allocation:");
      if (!lines || lines.length === 0) {
        console.log("    *** NO ALLOCATION LINES ***");
      } else {
        lines.forEach((line) => {
          console.log(`    ${line.line_type}: ${line.amount}`);
        });
      }
    }
  }

  // Check group totals
  const { data: groupData, error: groupError } = await client
    .from("member_transaction_header")
    .select("transaction_type,amount")
    .in("transaction_type", ["Interest Collection", "Penalty Collection"]);

  if (!groupError && groupData) {
    console.log("\n=== Group Totals ===");
    let totalInterest = 0;
    let totalPenalty = 0;
    groupData.forEach((trx) => {
      if (trx.transaction_type === "Interest Collection") totalInterest += trx.amount;
      if (trx.transaction_type === "Penalty Collection") totalPenalty += trx.amount;
    });
    console.log(`Total Interest Collection: ${totalInterest}`);
    console.log(`Total Penalty Collection: ${totalPenalty}`);
  }
}

debug().catch(console.error);
