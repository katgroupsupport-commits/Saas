-- Fix for Ajinkya More (member_id=57): Remove duplicate ₹2,000 loan repayment
-- Issue: Two identical loan repayments (IDs 86 and 95) both for ₹2,000
-- Solution: Delete the duplicate ID=86, keeping the properly reversed ID=95->ID=96

BEGIN;

-- First, verify the duplicate exists
SELECT 'VERIFICATION: Transactions to be affected' as step;
SELECT 
  h.member_trx_id,
  h.trx_number,
  h.member_id,
  h.trx_type,
  h.total_amount,
  h.reversed_flag,
  h.parent_trx_id,
  (SELECT COUNT(*) FROM member_transaction_lines WHERE member_trx_id = h.member_trx_id) as line_count
FROM member_transaction_header h
WHERE h.member_id = 57 
  AND h.trx_date >= '2026-07-01'
  AND h.trx_type = 'Loan Repayment'
  AND h.member_trx_id IN (86, 95, 96)
ORDER BY h.member_trx_id;

-- Delete the duplicate transaction ID=86 and its lines (via cascade)
DELETE FROM member_transaction_header
WHERE member_trx_id = 86;

-- Verify deletion
SELECT 'VERIFICATION: After deletion' as step;
SELECT 
  h.member_trx_id,
  h.trx_number,
  h.member_id,
  h.trx_type,
  h.total_amount,
  h.reversed_flag,
  h.parent_trx_id,
  (SELECT COUNT(*) FROM member_transaction_lines WHERE member_trx_id = h.member_trx_id) as line_count
FROM member_transaction_header h
WHERE h.member_id = 57 
  AND h.trx_date >= '2026-07-01'
  AND h.trx_type = 'Loan Repayment'
ORDER BY h.member_trx_id;

COMMIT;
