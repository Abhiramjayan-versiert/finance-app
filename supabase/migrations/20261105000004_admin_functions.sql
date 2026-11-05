-- =============================================================================
-- FINANCE OS — Admin user directory (account metadata only, never financial data)
-- =============================================================================
create or replace function public.admin_list_users(
  p_search text default null,
  p_status text default null,
  p_limit int default 25,
  p_offset int default 0
)
returns table (
  id uuid,
  full_name text,
  email text,
  status public.account_status,
  roles text[],
  email_confirmed boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  last_seen_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return query
  select p.id, p.full_name, p.email, p.status,
         coalesce((select array_agg(r.role::text order by r.role) from public.user_roles r where r.user_id = p.id), '{}'::text[]),
         (u.email_confirmed_at is not null),
         p.created_at,
         u.last_sign_in_at,
         p.last_seen_at,
         count(*) over ()
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.deleted_at is null
    and (v_search is null or p.email ilike '%' || v_search || '%' or p.full_name ilike '%' || v_search || '%')
    and (p_status is null or p_status = '' or
         (p_status = 'suspended' and p.status = 'suspended') or
         (p_status = 'active' and p.status = 'active') or
         (p_status = 'unverified' and u.email_confirmed_at is null) or
         (p_status = 'inactive' and (p.last_seen_at is null or p.last_seen_at < now() - interval '30 days')))
  order by p.created_at desc
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

revoke all on function public.admin_list_users(text, text, int, int) from public, anon;
grant execute on function public.admin_list_users(text, text, int, int) to authenticated;
