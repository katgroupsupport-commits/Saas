-- Supabase schema for Bachat Gat application
-- Relational tables and views for groups, members, transactions, loans, approvals, and reports.

CREATE TABLE IF NOT EXISTS roles (
  role_id serial PRIMARY KEY,
  role_name text NOT NULL UNIQUE,
  description text
);

CREATE TABLE IF NOT EXISTS groups (
  group_id serial PRIMARY KEY,
  group_name text NOT NULL,
  code text,
  primary_contact_name text,
  mobile_number text,
  email text,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_by int,
  creation_date timestamp with time zone DEFAULT now(),
  last_updated_by int,
  last_updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_setup (
  group_id int PRIMARY KEY REFERENCES groups(group_id) ON DELETE CASCADE,
  monthly_saving_amount numeric NOT NULL DEFAULT 0,
  interest_rate numeric NOT NULL DEFAULT 0,
  interest_type text NOT NULL DEFAULT 'flat',
  penalty_amount numeric NOT NULL DEFAULT 0,
  loan_limit numeric NOT NULL DEFAULT 0,
  loan_tenure_months int NOT NULL DEFAULT 12,
  loan_due_day int NOT NULL DEFAULT 1,
  auto_approve_withdrawal boolean NOT NULL DEFAULT false,
  auto_approve_loan boolean NOT NULL DEFAULT false,
  approver_names jsonb DEFAULT '[]',
  admin_names jsonb DEFAULT '[]',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  subscription_plan_id serial PRIMARY KEY,
  plan_name text NOT NULL,
  duration text,
  amount numeric NOT NULL DEFAULT 0,
  max_members int DEFAULT 0,
  features text
);

CREATE TABLE IF NOT EXISTS group_subscriptions (
  group_subscription_id serial PRIMARY KEY,
  group_id int REFERENCES groups(group_id) ON DELETE CASCADE,
  subscription_plan_id int REFERENCES subscription_plans(subscription_plan_id),
  payment_status text NOT NULL DEFAULT 'ACTIVE',
  start_date date,
  end_date date,
  transaction_reference text,
  created_by int,
  last_updated_by int,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
  member_id serial PRIMARY KEY,
  group_id int REFERENCES groups(group_id) ON DELETE CASCADE,
  role_id int REFERENCES roles(role_id),
  member_name text NOT NULL,
  username text UNIQUE,
  mobile_number text,
  email text,
  join_date date,
  exit_date date,
  status text NOT NULL DEFAULT 'ACTIVE',
  profile_photo text,
  created_by int,
  last_updated_by int,
  creation_date timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS member_setup (
  member_id int PRIMARY KEY REFERENCES members(member_id) ON DELETE CASCADE,
  custom_saving_amount numeric NOT NULL DEFAULT 0,
  loan_limit numeric NOT NULL DEFAULT 0,
  loan_tenure_months int NOT NULL DEFAULT 12,
  interest_rate numeric NOT NULL DEFAULT 0,
  interest_type text NOT NULL DEFAULT 'flat',
  active_flag boolean NOT NULL DEFAULT true,
  created_by int,
  last_updated_by int,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS periods (
  period_id serial PRIMARY KEY,
  group_id int REFERENCES groups(group_id) ON DELETE CASCADE,
  period_name text NOT NULL,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'FUTURE',
  created_by int,
  last_updated_by int,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS member_transaction_header (
  member_trx_id serial PRIMARY KEY,
  trx_number text UNIQUE,
  group_id int REFERENCES groups(group_id) ON DELETE CASCADE,
  member_id int REFERENCES members(member_id) ON DELETE CASCADE,
  period_id int REFERENCES periods(period_id),
  trx_date date NOT NULL,
  trx_type text NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  approval_status text NOT NULL DEFAULT 'PENDING',
  parent_trx_id int REFERENCES member_transaction_header(member_trx_id),
  adjustment_flag boolean NOT NULL DEFAULT false,
  reversed_flag boolean NOT NULL DEFAULT false,
  remarks text,
  created_by int,
  last_updated_by int,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS member_transaction_lines (
  line_id serial PRIMARY KEY,
  member_trx_id int REFERENCES member_transaction_header(member_trx_id) ON DELETE CASCADE,
  line_type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  remarks text,
  created_by int,
  last_updated_by int,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loan_distribution (
  loan_id serial PRIMARY KEY,
  loan_number text UNIQUE,
  group_id int REFERENCES groups(group_id) ON DELETE CASCADE,
  member_id int REFERENCES members(member_id) ON DELETE CASCADE,
  distributed_amount numeric NOT NULL DEFAULT 0,
  outstanding_principal numeric NOT NULL DEFAULT 0,
  outstanding_interest numeric NOT NULL DEFAULT 0,
  interest_rate numeric NOT NULL DEFAULT 0,
  loan_status text NOT NULL DEFAULT 'REQUESTED',
  purpose text,
  requested_months int,
  distribution_date date,
  approval_status text NOT NULL DEFAULT 'PENDING',
  created_by int,
  last_updated_by int,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approvals (
  approval_id serial PRIMARY KEY,
  group_id int REFERENCES groups(group_id) ON DELETE CASCADE,
  approval_batch_id text,
  reference_id int,
  reference_type text,
  transaction_type text,
  requester_name text,
  approver_member_id int REFERENCES members(member_id),
  approver_name text,
  level text,
  approval_status text NOT NULL DEFAULT 'PENDING',
  amount numeric NOT NULL DEFAULT 0,
  remarks text,
  created_by int,
  last_updated_by int,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loan_requests (
  loan_request_id serial PRIMARY KEY,
  request_number text UNIQUE,
  group_id int REFERENCES groups(group_id) ON DELETE CASCADE,
  member_id int REFERENCES members(member_id) ON DELETE CASCADE,
  requested_amount numeric NOT NULL DEFAULT 0,
  requested_months int,
  purpose text,
  request_date date,
  status text NOT NULL DEFAULT 'PENDING',
  approval_status text NOT NULL DEFAULT 'PENDING',
  created_by int,
  last_updated_by int,
  creation_date timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  withdrawal_request_id serial PRIMARY KEY,
  request_number text UNIQUE,
  group_id int REFERENCES groups(group_id) ON DELETE CASCADE,
  member_id int REFERENCES members(member_id) ON DELETE CASCADE,
  requested_amount numeric NOT NULL DEFAULT 0,
  request_date date,
  reason text,
  status text NOT NULL DEFAULT 'PENDING',
  approval_status text NOT NULL DEFAULT 'PENDING',
  created_by int,
  last_updated_by int,
  creation_date timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_expense_header (
  group_expense_id serial PRIMARY KEY,
  group_id int REFERENCES groups(group_id) ON DELETE CASCADE,
  period_id int REFERENCES periods(period_id),
  expense_number text UNIQUE,
  expense_date date,
  expense_type text,
  total_amount numeric NOT NULL DEFAULT 0,
  approval_status text NOT NULL DEFAULT 'PENDING',
  payment_mode text,
  remarks text,
  created_by int,
  last_updated_by int,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_expense_lines (
  group_expense_line_id serial PRIMARY KEY,
  group_expense_id int REFERENCES group_expense_header(group_expense_id) ON DELETE CASCADE,
  expense_category text,
  amount numeric NOT NULL DEFAULT 0,
  remarks text,
  created_by int,
  last_updated_by int,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_group_opening (
  legacy_group_opening_id serial PRIMARY KEY,
  group_id int REFERENCES groups(group_id) ON DELETE CASCADE,
  legacy_opening_amount numeric NOT NULL DEFAULT 0,
  approval_status text NOT NULL DEFAULT 'PENDING',
  created_by int,
  last_updated_by int,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_data (
  legacy_id serial PRIMARY KEY,
  group_id int REFERENCES groups(group_id) ON DELETE CASCADE,
  member_id int REFERENCES members(member_id) ON DELETE CASCADE,
  migration_date date,
  legacy_saving_balance numeric NOT NULL DEFAULT 0,
  legacy_loan_outstanding numeric NOT NULL DEFAULT 0,
  legacy_interest_balance numeric NOT NULL DEFAULT 0,
  legacy_penalty_balance numeric NOT NULL DEFAULT 0,
  legacy_bank_balance numeric NOT NULL DEFAULT 0,
  approval_status text NOT NULL DEFAULT 'PENDING',
  remarks text,
  created_by int,
  last_updated_by int,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pending_setup_changes (
  setup_change_id serial PRIMARY KEY,
  group_id int REFERENCES groups(group_id) ON DELETE CASCADE,
  approval_batch_id text,
  setup_type text,
  target_id int,
  target_name text,
  payload jsonb,
  old_value jsonb,
  change_summary text,
  status text NOT NULL DEFAULT 'PENDING',
  created_by int,
  last_updated_by int,
  creation_date timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_disputes (
  dispute_id serial PRIMARY KEY,
  group_id int REFERENCES groups(group_id) ON DELETE CASCADE,
  subject text,
  message text,
  status text NOT NULL DEFAULT 'OPEN',
  owner_reply text,
  created_by int,
  last_updated_by int,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trx_audit_history (
  audit_id serial PRIMARY KEY,
  trx_id int,
  action_type text,
  old_value jsonb,
  new_value jsonb,
  changed_by text,
  created_by int,
  last_updated_by int,
  changed_date timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_users (
  user_id serial PRIMARY KEY,
  supabase_user_id text UNIQUE,
  member_id int REFERENCES members(member_id),
  username text,
  email text,
  mobile_number text,
  status text NOT NULL DEFAULT 'ACTIVE',
  last_login_date timestamp with time zone,
  profile_photo text,
  created_by int,
  last_updated_by int,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS share_distribution (
  distribution_id serial PRIMARY KEY,
  group_id int REFERENCES groups(group_id) ON DELETE CASCADE,
  member_id int REFERENCES members(member_id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  distribution_date date,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS share_adjustments (
  adjustment_id serial PRIMARY KEY,
  group_id int REFERENCES groups(group_id) ON DELETE CASCADE,
  member_id int REFERENCES members(member_id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  reason text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE VIEW member_dashboard_balances AS
SELECT
  m.member_id,
  m.group_id,
  COALESCE(SUM(CASE WHEN h.approval_status IN ('COMPLETED', 'APPROVED') AND l.line_type = 'SAVINGS' THEN l.amount END), 0) AS savings,
  COALESCE(lb.outstanding_loan, 0) AS outstanding_loan,
  COALESCE(lb.outstanding_interest, 0) AS outstanding_interest,
  COALESCE(SUM(CASE WHEN h.approval_status IN ('COMPLETED', 'APPROVED') AND l.line_type = 'PENALTY' THEN l.amount END), 0) AS pending_charges,
  0 AS earned_from_group
FROM members m
LEFT JOIN member_transaction_header h ON h.member_id = m.member_id
LEFT JOIN member_transaction_lines l ON l.member_trx_id = h.member_trx_id
LEFT JOIN (
  SELECT member_id, SUM(outstanding_principal) AS outstanding_loan, SUM(outstanding_interest) AS outstanding_interest
  FROM loan_distribution
  GROUP BY member_id
) lb ON lb.member_id = m.member_id
GROUP BY m.member_id, m.group_id, lb.outstanding_loan, lb.outstanding_interest;
