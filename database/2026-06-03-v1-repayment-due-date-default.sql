alter table public.group_setup
  alter column loan_due_day set default 1;

update public.group_setup
set loan_due_day = 1
where loan_due_day is null;
