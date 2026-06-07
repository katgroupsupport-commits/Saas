alter table public.auth_users
  add column if not exists profile_photo_data text;

alter table public.members
  add column if not exists profile_photo_data text;
