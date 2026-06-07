-- Allow setup inheritance semantics:
-- null/blank = not configured, inherit from group/default
-- 0 = explicitly configured as zero

alter table public.group_setup
  alter column monthly_saving_amount drop not null,
  alter column monthly_saving_amount drop default,
  alter column interest_rate drop not null,
  alter column interest_rate drop default,
  alter column penalty_amount drop not null,
  alter column penalty_amount drop default,
  alter column loan_limit drop not null,
  alter column loan_limit drop default,
  alter column loan_tenure_months drop not null,
  alter column loan_tenure_months drop default,
  alter column loan_due_day drop not null,
  alter column loan_due_day drop default;

alter table public.member_setup
  alter column custom_saving_amount drop not null,
  alter column custom_saving_amount drop default,
  alter column loan_limit drop not null,
  alter column loan_limit drop default,
  alter column loan_tenure_months drop not null,
  alter column loan_tenure_months drop default,
  alter column interest_rate drop not null,
  alter column interest_rate drop default;
