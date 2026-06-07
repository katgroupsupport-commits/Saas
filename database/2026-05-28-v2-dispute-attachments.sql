alter table public.support_disputes
  add column if not exists attachment_data text;
