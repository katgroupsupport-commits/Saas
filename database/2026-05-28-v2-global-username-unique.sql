update public.members m
set username = left(
  regexp_replace(coalesce(nullif(m.username, ''), nullif(m.member_name, ''), 'member'), '[^A-Za-z0-9._-]', '', 'g')
  || '_' || m.member_id,
  120
)
where m.username is null
   or m.username = ''
   or exists (
    select 1
    from public.members other
    where other.member_id <> m.member_id
      and lower(other.username) = lower(m.username)
      and other.member_id < m.member_id
  );

create unique index if not exists members_username_unique
  on public.members(lower(username))
  where username is not null and username <> '';
