with admin_role as (
  select role_id
  from public.roles
  where role_name = 'Group Admin'
  limit 1
),
updated_existing as (
  update public.members m
  set
    member_name = coalesce(nullif(m.member_name, ''), nullif(au.username, ''), au.email, 'Group Admin'),
    username = coalesce(nullif(m.username, ''), au.username),
    mobile_number = coalesce(nullif(m.mobile_number, ''), au.mobile_number),
    email = coalesce(nullif(m.email, ''), au.email),
    role_id = coalesce(m.role_id, (select role_id from admin_role)),
    last_updated_by = au.user_id,
    last_update_date = now()
  from public.groups g
  join public.auth_users au on au.user_id = g.created_by
  where m.group_id = g.group_id
    and m.created_by = g.created_by
  returning m.member_id, m.group_id
),
inserted_members as (
  insert into public.members (
    group_id,
    role_id,
    member_name,
    username,
    mobile_number,
    email,
    join_date,
    status,
    created_by,
    last_updated_by
  )
  select
    g.group_id,
    (select role_id from admin_role),
    coalesce(nullif(au.username, ''), au.email, 'Group Admin'),
    au.username,
    au.mobile_number,
    au.email,
    coalesce(g.creation_date::date, current_date),
    'ACTIVE',
    au.user_id,
    au.user_id
  from public.groups g
  join public.auth_users au on au.user_id = g.created_by
  where not exists (
    select 1
    from public.members m
    where m.group_id = g.group_id
      and (
        m.created_by = g.created_by
        or lower(coalesce(m.email, '')) = lower(coalesce(au.email, ''))
      )
  )
  returning member_id, group_id, created_by
),
status_rows as (
  insert into public.member_status_history (
    member_id,
    group_id,
    status,
    start_date,
    created_by,
    last_updated_by
  )
  select
    im.member_id,
    im.group_id,
    'ACTIVE',
    current_date,
    im.created_by,
    im.created_by
  from inserted_members im
  where not exists (
    select 1
    from public.member_status_history msh
    where msh.member_id = im.member_id
  )
  returning member_id
)
insert into public.member_setup (
  member_id,
  custom_saving_amount,
  loan_limit,
  loan_tenure_months,
  active_flag,
  created_by,
  last_updated_by
)
select
  im.member_id,
  coalesce(gs.monthly_saving_amount, 0),
  coalesce(gs.loan_limit, 0),
  coalesce(gs.loan_tenure_months, 0),
  'Y',
  im.created_by,
  im.created_by
from inserted_members im
left join public.group_setup gs on gs.group_id = im.group_id
where not exists (
  select 1
  from public.member_setup ms
  where ms.member_id = im.member_id
);
