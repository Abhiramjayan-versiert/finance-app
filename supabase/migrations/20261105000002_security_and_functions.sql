-- =============================================================================
-- FINANCE OS — Row Level Security, privileges, integrity triggers and RPCs
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER so they can read user_roles regardless of RLS)
-- ---------------------------------------------------------------------------
create or replace function public.has_role(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.role = p_role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.role in ('super_admin', 'admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- New user bootstrap: profile, settings and personal copies of default categories
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signups jsonb;
begin
  select value into v_signups from public.platform_settings where key = 'signups_enabled';
  if v_signups is not null and v_signups = 'false'::jsonb then
    raise exception 'New registrations are currently disabled' using errcode = 'P0001';
  end if;

  insert into public.profiles (id, full_name, email, terms_accepted_at)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    coalesce(new.email, ''),
    case when (new.raw_user_meta_data ->> 'terms_accepted') = 'true' then now() else null end
  );

  insert into public.user_settings (user_id) values (new.id);

  insert into public.income_categories (user_id, name, icon, color, is_default)
  select new.id, d.name, d.icon, d.color, true
  from public.default_categories d
  where d.kind = 'income' and d.is_active
  order by d.sort_order;

  insert into public.expense_categories (user_id, name, icon, color, is_default)
  select new.id, d.name, d.icon, d.color, true
  from public.default_categories d
  where d.kind = 'expense' and d.is_active
  order by d.sort_order;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profile email in sync with auth email changes.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Integrity: savings balances can never go negative (row lock serialises
-- concurrent withdrawals on the same bucket).
-- ---------------------------------------------------------------------------
create or replace function public.savings_account_balance(p_account_id uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(case when t.type in ('deposit', 'transfer_in') then t.amount_minor else -t.amount_minor end), 0)::bigint
  from public.savings_transactions t
  where t.account_id = p_account_id;
$$;

create or replace function public.guard_savings_transaction()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_account public.savings_accounts%rowtype;
  v_balance bigint;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Savings transactions are immutable; delete and re-create instead' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    select * into v_account from public.savings_accounts
      where id = new.account_id and user_id = new.user_id
      for update;
    if not found or v_account.deleted_at is not null then
      raise exception 'Savings account not found' using errcode = '23503';
    end if;
    if new.type in ('withdrawal', 'transfer_out') then
      v_balance := public.savings_account_balance(new.account_id);
      if v_balance < new.amount_minor then
        raise exception 'Insufficient balance in savings account' using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  -- DELETE: removing a deposit must not leave the bucket negative.
  perform 1 from public.savings_accounts where id = old.account_id for update;
  return old;
end;
$$;

create trigger savings_transactions_guard
  before insert or update or delete on public.savings_transactions
  for each row execute function public.guard_savings_transaction();

create or replace function public.after_savings_transaction_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Deleting one leg of a transfer deletes the other leg too.
  if old.transfer_group is not null and pg_trigger_depth() = 1 then
    delete from public.savings_transactions
      where transfer_group = old.transfer_group and id <> old.id;
  end if;
  if exists (select 1 from public.savings_accounts a where a.id = old.account_id)
     and public.savings_account_balance(old.account_id) < 0 then
    raise exception 'Deleting this entry would make the savings balance negative' using errcode = '23514';
  end if;
  return old;
end;
$$;

create trigger savings_transactions_after_delete
  after delete on public.savings_transactions
  for each row execute function public.after_savings_transaction_delete();

-- Atomic transfer between two buckets (no effect on cash, income or expenses).
create or replace function public.transfer_savings(
  p_from_account uuid,
  p_to_account uuid,
  p_amount_minor bigint,
  p_occurred_on date default current_date,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_group uuid := gen_random_uuid();
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_from_account = p_to_account then
    raise exception 'Choose two different savings accounts' using errcode = '22023';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'Transfer amount must be positive' using errcode = '22023';
  end if;

  -- Lock both accounts in a stable order to avoid deadlocks.
  perform 1 from public.savings_accounts
    where id in (p_from_account, p_to_account) and user_id = v_uid and deleted_at is null
    order by id for update;
  if (select count(*) from public.savings_accounts
      where id in (p_from_account, p_to_account) and user_id = v_uid and deleted_at is null) <> 2 then
    raise exception 'Savings account not found' using errcode = '23503';
  end if;

  insert into public.savings_transactions (user_id, account_id, type, amount_minor, affects_cash, transfer_group, occurred_on, note)
  values (v_uid, p_from_account, 'transfer_out', p_amount_minor, false, v_group, coalesce(p_occurred_on, current_date), p_note);
  insert into public.savings_transactions (user_id, account_id, type, amount_minor, affects_cash, transfer_group, occurred_on, note)
  values (v_uid, p_to_account, 'transfer_in', p_amount_minor, false, v_group, coalesce(p_occurred_on, current_date), p_note);

  return v_group;
end;
$$;

-- ---------------------------------------------------------------------------
-- Integrity: goal allocations
-- ---------------------------------------------------------------------------
create or replace function public.guard_goal_contribution()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_goal public.financial_goals%rowtype;
  v_saved bigint;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Goal contributions are immutable; delete and re-create instead' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then
    perform 1 from public.financial_goals where id = old.goal_id for update;
    return old;
  end if;

  select * into v_goal from public.financial_goals
    where id = new.goal_id and user_id = new.user_id
    for update;
  if not found or v_goal.deleted_at is not null then
    raise exception 'Goal not found' using errcode = '23503';
  end if;
  if v_goal.savings_account_id is not null then
    raise exception 'This goal is funded by a linked savings account; add money to that account instead' using errcode = '23514';
  end if;
  select coalesce(sum(amount_minor), 0) into v_saved from public.goal_contributions where goal_id = new.goal_id;
  if v_saved + new.amount_minor < 0 then
    raise exception 'Cannot withdraw more than the amount allocated to this goal' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger goal_contributions_guard
  before insert or update or delete on public.goal_contributions
  for each row execute function public.guard_goal_contribution();

create or replace function public.after_goal_contribution_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.financial_goals g where g.id = old.goal_id)
     and (select coalesce(sum(amount_minor), 0) from public.goal_contributions where goal_id = old.goal_id) < 0 then
    raise exception 'Deleting this entry would make the goal allocation negative' using errcode = '23514';
  end if;
  return old;
end;
$$;

create trigger goal_contributions_after_delete
  after delete on public.goal_contributions
  for each row execute function public.after_goal_contribution_delete();

-- Linking a goal to a savings bucket is only allowed when it has no direct allocations.
create or replace function public.guard_goal_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.savings_account_id is not null
     and (tg_op = 'INSERT' or new.savings_account_id is distinct from old.savings_account_id)
     and exists (select 1 from public.goal_contributions c where c.goal_id = new.id) then
    raise exception 'Release this goal''s direct allocations before linking a savings account' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger financial_goals_link_guard
  before insert or update of savings_account_id on public.financial_goals
  for each row execute function public.guard_goal_link();

-- Create a goal and its opening allocation atomically.
create or replace function public.create_financial_goal(
  p_name text,
  p_category text,
  p_target_amount_minor bigint,
  p_target_date date,
  p_priority public.priority_level default 'medium',
  p_description text default null,
  p_product_category text default null,
  p_product_url text default null,
  p_image_path text default null,
  p_savings_account_id uuid default null,
  p_initial_saved_minor bigint default 0,
  p_initial_affects_cash boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_goal_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if coalesce(p_initial_saved_minor, 0) < 0 then
    raise exception 'Current savings cannot be negative' using errcode = '22023';
  end if;
  if p_savings_account_id is not null and coalesce(p_initial_saved_minor, 0) > 0 then
    raise exception 'A goal linked to a savings account uses that account''s balance' using errcode = '22023';
  end if;

  insert into public.financial_goals (user_id, name, category, target_amount_minor, target_date, priority,
    description, product_category, product_url, image_path, savings_account_id, status)
  values (v_uid, p_name, p_category, p_target_amount_minor, p_target_date, coalesce(p_priority, 'medium'),
    p_description, p_product_category, p_product_url, p_image_path, p_savings_account_id,
    case when coalesce(p_initial_saved_minor, 0) > 0 or p_savings_account_id is not null then 'active'::public.goal_status else 'not_started'::public.goal_status end)
  returning id into v_goal_id;

  if coalesce(p_initial_saved_minor, 0) > 0 then
    insert into public.goal_contributions (user_id, goal_id, amount_minor, affects_cash, note)
    values (v_uid, v_goal_id, p_initial_saved_minor, coalesce(p_initial_affects_cash, false), 'Opening balance');
  end if;

  return v_goal_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Integrity: debt payments cannot repay more principal than is outstanding
-- ---------------------------------------------------------------------------
create or replace function public.guard_debt_payment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_debt public.debts%rowtype;
  v_paid bigint;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Debt payments are immutable; delete and re-create instead' using errcode = '23514';
  end if;
  select * into v_debt from public.debts where id = new.debt_id and user_id = new.user_id for update;
  if not found or v_debt.deleted_at is not null then
    raise exception 'Debt not found' using errcode = '23503';
  end if;
  select coalesce(sum(principal_minor), 0) into v_paid from public.debt_payments where debt_id = new.debt_id;
  if v_paid + new.principal_minor > v_debt.opening_outstanding_minor then
    raise exception 'Principal repaid cannot exceed the outstanding amount' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger debt_payments_guard
  before insert or update on public.debt_payments
  for each row execute function public.guard_debt_payment();

-- ---------------------------------------------------------------------------
-- Investments: keep the current value in step with buys, sells and valuations
-- ---------------------------------------------------------------------------
create or replace function public.apply_investment_transaction()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type = 'valuation' then
    update public.investments
      set current_value_minor = new.amount_minor,
          current_value_as_of = new.occurred_on
      where id = new.investment_id and user_id = new.user_id;
  elsif new.type = 'buy' then
    update public.investments
      set current_value_minor = current_value_minor + new.amount_minor,
          current_value_as_of = greatest(coalesce(current_value_as_of, new.occurred_on), new.occurred_on)
      where id = new.investment_id and user_id = new.user_id;
  elsif new.type = 'sell' then
    update public.investments
      set current_value_minor = greatest(current_value_minor - new.amount_minor, 0),
          current_value_as_of = greatest(coalesce(current_value_as_of, new.occurred_on), new.occurred_on)
      where id = new.investment_id and user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger investment_transactions_apply
  after insert on public.investment_transactions
  for each row execute function public.apply_investment_transaction();

create or replace function public.guard_investment_transaction()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Investment transactions are immutable; delete and re-create instead' using errcode = '23514';
  end if;
  perform 1 from public.investments where id = new.investment_id and user_id = new.user_id and deleted_at is null for update;
  if not found then
    raise exception 'Investment not found' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger investment_transactions_guard
  before insert or update on public.investment_transactions
  for each row execute function public.guard_investment_transaction();

create or replace function public.create_investment(
  p_name text,
  p_asset_type public.asset_class,
  p_amount_invested_minor bigint,
  p_purchase_date date,
  p_units numeric default null,
  p_price_per_unit_minor bigint default null,
  p_current_value_minor bigint default null,
  p_symbol text default null,
  p_notes text default null,
  p_affects_cash boolean default false,
  p_sip_monthly_minor bigint default null,
  p_sip_start_date date default null,
  p_sip_duration_months smallint default null,
  p_expected_return_pct numeric default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_amount_invested_minor is null or p_amount_invested_minor <= 0 then
    raise exception 'Amount invested must be positive' using errcode = '22023';
  end if;

  insert into public.investments (user_id, name, asset_type, symbol, purchase_date, current_value_minor,
    current_value_as_of, notes, sip_monthly_minor, sip_start_date, sip_duration_months, expected_return_pct)
  values (v_uid, p_name, p_asset_type, p_symbol, p_purchase_date, 0, p_purchase_date, p_notes,
    p_sip_monthly_minor, p_sip_start_date, p_sip_duration_months, p_expected_return_pct)
  returning id into v_id;

  insert into public.investment_transactions (user_id, investment_id, type, amount_minor, units, price_per_unit_minor, affects_cash, occurred_on, note)
  values (v_uid, v_id, 'buy', p_amount_invested_minor, p_units, p_price_per_unit_minor, coalesce(p_affects_cash, false), p_purchase_date, 'Initial investment');

  if p_current_value_minor is not null and p_current_value_minor <> p_amount_invested_minor then
    insert into public.investment_transactions (user_id, investment_id, type, amount_minor, affects_cash, occurred_on, note)
    values (v_uid, v_id, 'valuation', p_current_value_minor, false, greatest(p_purchase_date, current_date), 'Current value');
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cash ledger summary (SECURITY INVOKER => RLS limits it to the caller's rows)
-- ---------------------------------------------------------------------------
create or replace function public.cash_summary()
returns table (
  opening_balance_minor bigint,
  income_minor bigint,
  expense_minor bigint,
  savings_net_minor bigint,
  goals_net_minor bigint,
  investments_net_minor bigint,
  debt_payments_minor bigint,
  cash_balance_minor bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with
  s as (select coalesce((select opening_balance_minor from public.user_settings where user_id = (select auth.uid())), 0)::bigint as v),
  i as (select coalesce(sum(amount_minor), 0)::bigint as v from public.transactions
        where user_id = (select auth.uid()) and type = 'income' and status = 'completed' and deleted_at is null),
  e as (select coalesce(sum(amount_minor), 0)::bigint as v from public.transactions
        where user_id = (select auth.uid()) and type = 'expense' and deleted_at is null),
  sv as (select coalesce(sum(case when type = 'deposit' then amount_minor else -amount_minor end), 0)::bigint as v
         from public.savings_transactions
         where user_id = (select auth.uid()) and affects_cash and type in ('deposit', 'withdrawal')),
  g as (select coalesce(sum(amount_minor), 0)::bigint as v from public.goal_contributions
        where user_id = (select auth.uid()) and affects_cash),
  inv as (select coalesce(sum(case when type = 'buy' then amount_minor when type = 'sell' then -amount_minor else 0 end), 0)::bigint as v
          from public.investment_transactions where user_id = (select auth.uid()) and affects_cash),
  d as (select coalesce(sum(amount_minor), 0)::bigint as v from public.debt_payments
        where user_id = (select auth.uid()) and affects_cash)
  select s.v, i.v, e.v, sv.v, g.v, inv.v, d.v,
         (s.v + i.v - e.v - sv.v - g.v - inv.v - d.v)::bigint
  from s, i, e, sv, g, inv, d;
$$;

-- Balances per savings bucket.
create view public.savings_account_balances
with (security_invoker = true) as
select a.id as account_id,
       a.user_id,
       coalesce(sum(case when t.type in ('deposit', 'transfer_in') then t.amount_minor else -t.amount_minor end), 0)::bigint as balance_minor
from public.savings_accounts a
left join public.savings_transactions t on t.account_id = a.id
group by a.id, a.user_id;

-- Saved amount per goal (linked goals read the bucket balance).
create view public.goal_progress
with (security_invoker = true) as
select g.id as goal_id,
       g.user_id,
       case
         when g.savings_account_id is not null then coalesce(b.balance_minor, 0)
         else coalesce((select sum(c.amount_minor) from public.goal_contributions c where c.goal_id = g.id), 0)
       end::bigint as saved_minor
from public.financial_goals g
left join public.savings_account_balances b on b.account_id = g.savings_account_id;

-- Outstanding principal per debt.
create view public.debt_balances
with (security_invoker = true) as
select d.id as debt_id,
       d.user_id,
       (d.opening_outstanding_minor - coalesce(sum(p.principal_minor), 0))::bigint as outstanding_minor,
       coalesce(sum(p.principal_minor), 0)::bigint as principal_paid_minor,
       coalesce(sum(p.interest_minor), 0)::bigint as interest_paid_minor,
       count(p.id)::int as payment_count
from public.debts d
left join public.debt_payments p on p.debt_id = d.id
group by d.id, d.user_id, d.opening_outstanding_minor;

-- ---------------------------------------------------------------------------
-- Activity tracking (DAU/WAU/MAU) — writes only the caller's own row.
-- ---------------------------------------------------------------------------
create or replace function public.record_activity()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_rows int;
begin
  if v_uid is null then
    return false;
  end if;
  insert into public.user_activity (user_id, activity_date)
  values (v_uid, (now() at time zone 'utc')::date)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  update public.profiles set last_seen_at = now()
    where id = v_uid and (last_seen_at is null or last_seen_at < now() - interval '10 minutes');
  return v_rows > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rate limiting (server-side only, called with the service role)
-- ---------------------------------------------------------------------------
create or replace function public.check_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.rate_limits%rowtype;
begin
  insert into public.rate_limits (bucket_key, hits, window_started_at)
  values (p_key, 0, now())
  on conflict (bucket_key) do nothing;

  select * into v_row from public.rate_limits where bucket_key = p_key for update;
  if v_row.window_started_at < now() - make_interval(secs => p_window_seconds) then
    update public.rate_limits set hits = 1, window_started_at = now() where bucket_key = p_key;
    return true;
  end if;
  if v_row.hits >= p_max then
    return false;
  end if;
  update public.rate_limits set hits = hits + 1 where bucket_key = p_key;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin analytics: aggregate, non-financial platform metrics only.
-- ---------------------------------------------------------------------------
create or replace function public.admin_platform_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'total_users', (select count(*) from public.profiles where deleted_at is null),
    'verified_users', (select count(*) from auth.users u join public.profiles p on p.id = u.id where u.email_confirmed_at is not null and p.deleted_at is null),
    'suspended_users', (select count(*) from public.profiles where status = 'suspended' and deleted_at is null),
    'new_users_7d', (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
    'new_users_30d', (select count(*) from public.profiles where created_at >= now() - interval '30 days'),
    'dau', (select count(distinct user_id) from public.user_activity where activity_date = (now() at time zone 'utc')::date),
    'wau', (select count(distinct user_id) from public.user_activity where activity_date > (now() at time zone 'utc')::date - 7),
    'mau', (select count(distinct user_id) from public.user_activity where activity_date > (now() at time zone 'utc')::date - 30),
    'errors_24h', (select count(*) from public.app_errors where created_at >= now() - interval '24 hours'),
    'errors_7d', (select count(*) from public.app_errors where created_at >= now() - interval '7 days')
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.admin_registration_series(p_days int default 90)
returns table (day date, registrations bigint, active_users bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return query
  select d::date,
         (select count(*) from public.profiles p where (p.created_at at time zone 'utc')::date = d::date),
         (select count(*) from public.user_activity a where a.activity_date = d::date)
  from generate_series((now() at time zone 'utc')::date - (least(greatest(p_days, 1), 365) - 1), (now() at time zone 'utc')::date, interval '1 day') d
  order by 1;
end;
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_settings enable row level security;
alter table public.default_categories enable row level security;
alter table public.income_categories enable row level security;
alter table public.expense_categories enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.savings_accounts enable row level security;
alter table public.savings_transactions enable row level security;
alter table public.financial_goals enable row level security;
alter table public.goal_contributions enable row level security;
alter table public.investments enable row level security;
alter table public.investment_transactions enable row level security;
alter table public.debts enable row level security;
alter table public.debt_payments enable row level security;
alter table public.assets enable row level security;
alter table public.liabilities enable row level security;
alter table public.financial_snapshots enable row level security;
alter table public.notification_templates enable row level security;
alter table public.notifications enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.audit_logs enable row level security;
alter table public.platform_settings enable row level security;
alter table public.app_errors enable row level security;
alter table public.user_activity enable row level security;
alter table public.rate_limits enable row level security;

-- Anonymous visitors get nothing except public platform flags.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on all functions in schema public from public;

-- Profiles: own row (and admins may list profiles — no financial data lives here).
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, avatar_url, country, onboarded_at) on public.profiles to authenticated;

-- Roles: readable by the owner and admins; never writable by clients.
create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
revoke insert, update, delete on public.user_roles from authenticated;

-- Settings.
create policy user_settings_select on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_settings_update on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke insert, delete on public.user_settings from authenticated;

-- Read-only reference data.
create policy default_categories_read on public.default_categories for select to authenticated using (true);
create policy achievements_read on public.achievements for select to authenticated using (true);
create policy notification_templates_read on public.notification_templates for select to authenticated using (true);
revoke insert, update, delete on public.default_categories, public.achievements, public.notification_templates from authenticated;

-- Platform settings: public flags are readable by everyone, the rest by admins.
grant select on public.platform_settings to anon;
create policy platform_settings_public_read on public.platform_settings for select to anon, authenticated
  using (is_public or (select public.is_admin()));
revoke insert, update, delete on public.platform_settings from authenticated;

-- Admin-only observability tables (written by the server with the service role).
create policy audit_logs_admin_read on public.audit_logs for select to authenticated using ((select public.is_admin()));
create policy app_errors_admin_read on public.app_errors for select to authenticated using ((select public.is_admin()));
revoke insert, update, delete on public.audit_logs, public.app_errors from authenticated;

-- Activity: users can see their own activity days only.
create policy user_activity_select on public.user_activity for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.user_activity from authenticated;

-- Rate limits: no client access at all.
revoke all on public.rate_limits from authenticated;

-- Owner-only financial tables: identical policy set.
do $$
declare
  t text;
begin
  foreach t in array array[
    'income_categories', 'expense_categories', 'recurring_transactions', 'transactions', 'budgets',
    'savings_accounts', 'savings_transactions', 'financial_goals', 'goal_contributions',
    'investments', 'investment_transactions', 'debts', 'debt_payments', 'assets', 'liabilities',
    'financial_snapshots', 'notifications', 'user_achievements'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete_own', t);
  end loop;
end;
$$;

-- Achievements are awarded by the app; users cannot edit or back-date them.
revoke update on public.user_achievements from authenticated;
-- Notifications: users may only flip read state.
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Function execution grants.
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_role(public.app_role) to authenticated;
grant execute on function public.transfer_savings(uuid, uuid, bigint, date, text) to authenticated;
grant execute on function public.create_financial_goal(text, text, bigint, date, public.priority_level, text, text, text, text, uuid, bigint, boolean) to authenticated;
grant execute on function public.create_investment(text, public.asset_class, bigint, date, numeric, bigint, bigint, text, text, boolean, bigint, date, smallint, numeric) to authenticated;
grant execute on function public.cash_summary() to authenticated;
grant execute on function public.savings_account_balance(uuid) to authenticated;
grant execute on function public.record_activity() to authenticated;
grant execute on function public.admin_platform_stats() to authenticated;
grant execute on function public.admin_registration_series(int) to authenticated;
grant execute on function public.set_updated_at() to authenticated;
-- Trigger functions run as the table owner context of the trigger; explicit grants for invoker paths:
grant execute on function public.guard_savings_transaction() to authenticated;
grant execute on function public.after_savings_transaction_delete() to authenticated;
grant execute on function public.guard_goal_contribution() to authenticated;
grant execute on function public.after_goal_contribution_delete() to authenticated;
grant execute on function public.guard_goal_link() to authenticated;
grant execute on function public.guard_debt_payment() to authenticated;
grant execute on function public.apply_investment_transaction() to authenticated;
grant execute on function public.guard_investment_transaction() to authenticated;
grant execute on function public.enforce_single_level_category() to authenticated;
revoke execute on function public.check_rate_limit(text, int, int) from authenticated;
grant execute on function public.check_rate_limit(text, int, int) to service_role;
grant select on public.savings_account_balances, public.goal_progress, public.debt_balances to authenticated;

-- ---------------------------------------------------------------------------
-- Storage (only when running on Supabase, where the storage schema exists)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values
      ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
      ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
      ('goal-images', 'goal-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;

    -- Files live under "<user_id>/..." and are only reachable by their owner.
    execute $p$create policy "own files read" on storage.objects for select to authenticated
      using (bucket_id in ('receipts', 'avatars', 'goal-images') and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$create policy "own files insert" on storage.objects for insert to authenticated
      with check (bucket_id in ('receipts', 'avatars', 'goal-images') and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$create policy "own files update" on storage.objects for update to authenticated
      using (bucket_id in ('receipts', 'avatars', 'goal-images') and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$create policy "own files delete" on storage.objects for delete to authenticated
      using (bucket_id in ('receipts', 'avatars', 'goal-images') and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  end if;
end;
$$;
