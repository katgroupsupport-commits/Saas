create or replace function public.email_registered(check_email text)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users au
    where lower(au.email) = lower(check_email)
  )
  or exists (
    select 1
    from public.auth_users pu
    where lower(pu.email) = lower(check_email)
  );
$$;

grant execute on function public.email_registered(text) to anon, authenticated;
