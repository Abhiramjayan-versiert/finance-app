-- =============================================================================
-- FINANCE OS — Core schema
-- All money values are stored as BIGINT minor units (e.g. paise for INR).
-- Every user-owned table carries user_id and is protected by RLS (see 0002).
-- Cross-row references use composite (id, user_id) foreign keys so a user can
-- never attach their record to another user's row, even if they guess a UUID.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Money guard: realistic upper bound keeps JS number precision safe (< 2^53).
create domain public.money_minor as bigint check (value between -1000000000000000 and 1000000000000000);

-- ---------------------------------------------------------------------------
-- Identity & roles
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('super_admin', 'admin', 'support');
create type public.account_status as enum ('active', 'suspended');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text not null default '',
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500),
  country text not null default 'IN' check (char_length(country) <= 2),
  status public.account_status not null default 'active',
  suspended_reason text,
  terms_accepted_at timestamptz,
  onboarded_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index profiles_created_at_idx on public.profiles (created_at desc);
create index profiles_email_idx on public.profiles (lower(email));
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  currency char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  locale text not null default 'en-IN' check (char_length(locale) <= 20),
  timezone text not null default 'Asia/Kolkata' check (char_length(timezone) <= 60),
  date_format text not null default 'dd/MM/yyyy' check (date_format in ('dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'dd MMM yyyy')),
  fy_start_month smallint not null default 4 check (fy_start_month between 1 and 12),
  theme text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  opening_balance_minor public.money_minor not null default 0,
  net_worth_cash_source text not null default 'tracked' check (net_worth_cash_source in ('tracked', 'manual')),
  default_payment_method text not null default 'upi',
  notification_prefs jsonb not null default jsonb_build_object(
    'budget_warnings', true,
    'goal_deadlines', true,
    'emi_reminders', true,
    'recurring_reminders', true,
    'monthly_summary', true,
    'milestones', true,
    'email', false
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger user_settings_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
create table public.default_categories (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('income', 'expense')),
  name text not null check (char_length(name) between 1 and 60),
  icon text not null default 'circle',
  color text not null default '#A0A6AD',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, name)
);
create trigger default_categories_updated_at before update on public.default_categories
  for each row execute function public.set_updated_at();

create table public.income_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  icon text not null default 'circle',
  color text not null default '#39C982',
  is_default boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);
create trigger income_categories_updated_at before update on public.income_categories
  for each row execute function public.set_updated_at();

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid,
  name text not null check (char_length(name) between 1 and 60),
  icon text not null default 'circle',
  color text not null default '#A0A6AD',
  is_default boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (parent_id, user_id) references public.expense_categories (id, user_id) on delete cascade,
  check (parent_id is null or parent_id <> id)
);
create unique index expense_categories_unique_name on public.expense_categories
  (user_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create trigger expense_categories_updated_at before update on public.expense_categories
  for each row execute function public.set_updated_at();

-- Only one level of subcategories.
create or replace function public.enforce_single_level_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null and exists (
    select 1 from public.expense_categories p where p.id = new.parent_id and p.parent_id is not null
  ) then
    raise exception 'Subcategories cannot be nested more than one level' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger expense_categories_single_level before insert or update on public.expense_categories
  for each row execute function public.enforce_single_level_category();

-- ---------------------------------------------------------------------------
-- Transactions (income & expenses) and recurring rules
-- ---------------------------------------------------------------------------
create type public.transaction_type as enum ('income', 'expense');
create type public.transaction_status as enum ('completed', 'expected');
create type public.payment_method as enum ('cash', 'upi', 'debit_card', 'credit_card', 'bank_transfer', 'other');
create type public.recurrence_frequency as enum ('daily', 'weekly', 'monthly', 'yearly');

create table public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.transaction_type not null,
  title text not null check (char_length(title) between 1 and 120),
  amount_minor public.money_minor not null check (amount_minor > 0),
  currency char(3) not null default 'INR',
  income_category_id uuid,
  expense_category_id uuid,
  payment_method public.payment_method not null default 'upi',
  merchant text check (merchant is null or char_length(merchant) <= 120),
  source text check (source is null or char_length(source) <= 120),
  notes text check (notes is null or char_length(notes) <= 1000),
  frequency public.recurrence_frequency not null,
  interval_count smallint not null default 1 check (interval_count between 1 and 365),
  start_date date not null,
  end_date date,
  last_generated_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  check (end_date is null or end_date >= start_date),
  check ((type = 'income' and expense_category_id is null) or (type = 'expense' and income_category_id is null)),
  foreign key (income_category_id, user_id) references public.income_categories (id, user_id) on delete set null (income_category_id),
  foreign key (expense_category_id, user_id) references public.expense_categories (id, user_id) on delete set null (expense_category_id)
);
create index recurring_transactions_user_idx on public.recurring_transactions (user_id) where deleted_at is null;
create trigger recurring_transactions_updated_at before update on public.recurring_transactions
  for each row execute function public.set_updated_at();

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.transaction_type not null,
  status public.transaction_status not null default 'completed',
  title text not null check (char_length(title) between 1 and 120),
  amount_minor public.money_minor not null check (amount_minor > 0),
  currency char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  income_category_id uuid,
  expense_category_id uuid,
  occurred_on date not null,
  payment_method public.payment_method not null default 'upi',
  merchant text check (merchant is null or char_length(merchant) <= 120),
  source text check (source is null or char_length(source) <= 120),
  notes text check (notes is null or char_length(notes) <= 1000),
  receipt_path text check (receipt_path is null or char_length(receipt_path) <= 300),
  is_recurring boolean not null default false,
  recurring_id uuid,
  occurrence_date date,
  client_ref uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  check ((type = 'income' and expense_category_id is null) or (type = 'expense' and income_category_id is null)),
  check (status = 'completed' or type = 'income'),
  check (recurring_id is null or occurrence_date is not null),
  foreign key (income_category_id, user_id) references public.income_categories (id, user_id) on delete set null (income_category_id),
  foreign key (expense_category_id, user_id) references public.expense_categories (id, user_id) on delete set null (expense_category_id),
  foreign key (recurring_id, user_id) references public.recurring_transactions (id, user_id) on delete set null (recurring_id)
);
-- Idempotency: a recurring rule produces at most one transaction per occurrence.
create unique index transactions_recurring_occurrence_uidx on public.transactions (recurring_id, occurrence_date)
  where recurring_id is not null;
-- Idempotency for client submissions (double-clicks, offline queue replays).
create unique index transactions_client_ref_uidx on public.transactions (user_id, client_ref) where client_ref is not null;
create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc) where deleted_at is null;
create index transactions_user_type_date_idx on public.transactions (user_id, type, occurred_on desc) where deleted_at is null;
create index transactions_expense_category_idx on public.transactions (expense_category_id) where expense_category_id is not null;
create index transactions_income_category_idx on public.transactions (income_category_id) where income_category_id is not null;
create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Budgets
-- ---------------------------------------------------------------------------
create type public.budget_period as enum ('monthly', 'yearly');

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  period public.budget_period not null default 'monthly',
  expense_category_id uuid,
  amount_minor public.money_minor not null check (amount_minor > 0),
  thresholds smallint[] not null default '{50,75,90,100}',
  start_date date not null default date_trunc('month', now())::date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  check (end_date is null or end_date >= start_date),
  check (array_length(thresholds, 1) between 1 and 6 and 1 <= all (thresholds) and 200 >= all (thresholds)),
  foreign key (expense_category_id, user_id) references public.expense_categories (id, user_id) on delete cascade
);
create unique index budgets_one_per_scope_uidx on public.budgets
  (user_id, period, coalesce(expense_category_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where deleted_at is null;
create trigger budgets_updated_at before update on public.budgets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Savings buckets
-- ---------------------------------------------------------------------------
create type public.savings_tx_type as enum ('deposit', 'withdrawal', 'transfer_in', 'transfer_out');

create table public.savings_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null default 'general' check (kind in ('emergency', 'vacation', 'gadget', 'vehicle', 'house', 'education', 'general', 'other')),
  target_amount_minor public.money_minor check (target_amount_minor is null or target_amount_minor > 0),
  monthly_target_minor public.money_minor check (monthly_target_minor is null or monthly_target_minor > 0),
  color text not null default '#B7F34A',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);
create trigger savings_accounts_updated_at before update on public.savings_accounts
  for each row execute function public.set_updated_at();

create table public.savings_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  account_id uuid not null,
  type public.savings_tx_type not null,
  amount_minor public.money_minor not null check (amount_minor > 0),
  affects_cash boolean not null default true,
  transfer_group uuid,
  occurred_on date not null default current_date,
  note text check (note is null or char_length(note) <= 500),
  client_ref uuid,
  created_at timestamptz not null default now(),
  foreign key (account_id, user_id) references public.savings_accounts (id, user_id) on delete cascade,
  -- Transfers never touch the cash balance.
  check (type in ('deposit', 'withdrawal') or (affects_cash = false and transfer_group is not null))
);
create index savings_transactions_account_idx on public.savings_transactions (account_id, occurred_on desc);
create index savings_transactions_user_idx on public.savings_transactions (user_id, occurred_on desc);
create unique index savings_transactions_client_ref_uidx on public.savings_transactions (user_id, client_ref) where client_ref is not null;

-- ---------------------------------------------------------------------------
-- Financial goals
-- ---------------------------------------------------------------------------
create type public.goal_status as enum ('not_started', 'active', 'paused', 'cancelled', 'completed');
create type public.priority_level as enum ('low', 'medium', 'high');

create table public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  category text not null default 'other' check (category in ('gadgets', 'vehicles', 'travel', 'education', 'home', 'business', 'personal', 'emergency_fund', 'investments', 'retirement', 'other')),
  product_category text check (product_category is null or char_length(product_category) <= 80),
  description text check (description is null or char_length(description) <= 2000),
  target_amount_minor public.money_minor not null check (target_amount_minor > 0),
  target_date date not null,
  priority public.priority_level not null default 'medium',
  status public.goal_status not null default 'active',
  image_path text check (image_path is null or char_length(image_path) <= 300),
  product_url text check (product_url is null or (char_length(product_url) <= 500 and product_url ~* '^https?://')),
  -- When linked, the goal's saved amount is the savings bucket's balance (no separate allocations).
  savings_account_id uuid,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (savings_account_id, user_id) references public.savings_accounts (id, user_id) on delete set null (savings_account_id)
);
-- A savings bucket can back at most one goal, so its balance is never counted twice.
create unique index financial_goals_savings_account_uidx on public.financial_goals (savings_account_id)
  where savings_account_id is not null and deleted_at is null;
create index financial_goals_user_idx on public.financial_goals (user_id, target_date) where deleted_at is null;
create trigger financial_goals_updated_at before update on public.financial_goals
  for each row execute function public.set_updated_at();

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  goal_id uuid not null,
  -- Positive = allocate money to the goal, negative = release money from the goal.
  amount_minor public.money_minor not null check (amount_minor <> 0),
  affects_cash boolean not null default true,
  occurred_on date not null default current_date,
  note text check (note is null or char_length(note) <= 500),
  client_ref uuid,
  created_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.financial_goals (id, user_id) on delete cascade
);
create index goal_contributions_goal_idx on public.goal_contributions (goal_id, occurred_on desc);
create index goal_contributions_user_idx on public.goal_contributions (user_id);
create unique index goal_contributions_client_ref_uidx on public.goal_contributions (user_id, client_ref) where client_ref is not null;

-- ---------------------------------------------------------------------------
-- Investments
-- ---------------------------------------------------------------------------
create type public.asset_class as enum ('stock', 'mutual_fund', 'sip', 'etf', 'fixed_deposit', 'recurring_deposit', 'gold', 'digital_asset', 'bond', 'other');
create type public.investment_tx_type as enum ('buy', 'sell', 'valuation');

create table public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  asset_type public.asset_class not null,
  symbol text check (symbol is null or char_length(symbol) <= 30),
  purchase_date date not null,
  current_value_minor public.money_minor not null default 0 check (current_value_minor >= 0),
  current_value_as_of date,
  notes text check (notes is null or char_length(notes) <= 1000),
  sip_monthly_minor public.money_minor check (sip_monthly_minor is null or sip_monthly_minor > 0),
  sip_start_date date,
  sip_duration_months smallint check (sip_duration_months is null or sip_duration_months between 1 and 600),
  expected_return_pct numeric(6, 3) check (expected_return_pct is null or expected_return_pct between -100 and 100),
  -- Reserved for future market-data integrations (provider + instrument id).
  market_data_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);
create index investments_user_idx on public.investments (user_id) where deleted_at is null;
create trigger investments_updated_at before update on public.investments
  for each row execute function public.set_updated_at();

create table public.investment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  investment_id uuid not null,
  type public.investment_tx_type not null,
  amount_minor public.money_minor not null check (amount_minor >= 0),
  units numeric(24, 8) check (units is null or units >= 0),
  price_per_unit_minor public.money_minor check (price_per_unit_minor is null or price_per_unit_minor >= 0),
  affects_cash boolean not null default true,
  occurred_on date not null default current_date,
  note text check (note is null or char_length(note) <= 500),
  client_ref uuid,
  created_at timestamptz not null default now(),
  foreign key (investment_id, user_id) references public.investments (id, user_id) on delete cascade,
  check (type <> 'valuation' or affects_cash = false),
  check (type = 'valuation' or amount_minor > 0)
);
create index investment_transactions_investment_idx on public.investment_transactions (investment_id, occurred_on);
create index investment_transactions_user_idx on public.investment_transactions (user_id);
create unique index investment_transactions_client_ref_uidx on public.investment_transactions (user_id, client_ref) where client_ref is not null;

-- ---------------------------------------------------------------------------
-- Debts & EMIs
-- ---------------------------------------------------------------------------
create type public.debt_kind as enum ('personal', 'education', 'vehicle', 'home', 'credit_card', 'other');
create type public.payment_frequency as enum ('weekly', 'monthly', 'quarterly', 'yearly');

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind public.debt_kind not null default 'personal',
  lender text check (lender is null or char_length(lender) <= 120),
  principal_minor public.money_minor not null check (principal_minor > 0),
  -- Outstanding principal at the time the debt was added to FINANCE OS.
  opening_outstanding_minor public.money_minor not null check (opening_outstanding_minor >= 0),
  interest_rate numeric(7, 4) not null default 0 check (interest_rate between 0 and 100),
  emi_minor public.money_minor check (emi_minor is null or emi_minor > 0),
  payment_frequency public.payment_frequency not null default 'monthly',
  start_date date not null,
  end_date date,
  next_due_date date,
  notes text check (notes is null or char_length(notes) <= 1000),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  check (end_date is null or end_date >= start_date)
);
create index debts_user_idx on public.debts (user_id) where deleted_at is null;
create trigger debts_updated_at before update on public.debts
  for each row execute function public.set_updated_at();

create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  debt_id uuid not null,
  amount_minor public.money_minor not null check (amount_minor > 0),
  principal_minor public.money_minor not null check (principal_minor >= 0),
  interest_minor public.money_minor not null check (interest_minor >= 0),
  affects_cash boolean not null default true,
  paid_on date not null default current_date,
  note text check (note is null or char_length(note) <= 500),
  client_ref uuid,
  created_at timestamptz not null default now(),
  foreign key (debt_id, user_id) references public.debts (id, user_id) on delete cascade,
  check (principal_minor + interest_minor = amount_minor)
);
create index debt_payments_debt_idx on public.debt_payments (debt_id, paid_on desc);
create index debt_payments_user_idx on public.debt_payments (user_id);
create unique index debt_payments_client_ref_uidx on public.debt_payments (user_id, client_ref) where client_ref is not null;

-- ---------------------------------------------------------------------------
-- Manual assets & liabilities (things not tracked by other modules)
-- ---------------------------------------------------------------------------
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  type text not null check (type in ('cash', 'bank_account', 'property', 'vehicle', 'gold', 'other')),
  value_minor public.money_minor not null check (value_minor >= 0),
  as_of date not null default current_date,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);
create index assets_user_idx on public.assets (user_id) where deleted_at is null;
create trigger assets_updated_at before update on public.assets
  for each row execute function public.set_updated_at();

create table public.liabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  type text not null check (type in ('credit_card', 'personal_debt', 'other')),
  amount_minor public.money_minor not null check (amount_minor >= 0),
  as_of date not null default current_date,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);
create index liabilities_user_idx on public.liabilities (user_id) where deleted_at is null;
create trigger liabilities_updated_at before update on public.liabilities
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Snapshots, notifications, achievements
-- ---------------------------------------------------------------------------
create table public.financial_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  snapshot_month date not null check (extract(day from snapshot_month) = 1),
  total_assets_minor public.money_minor not null,
  total_liabilities_minor public.money_minor not null,
  net_worth_minor public.money_minor not null,
  breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, snapshot_month)
);
create trigger financial_snapshots_updated_at before update on public.financial_snapshots
  for each row execute function public.set_updated_at();

create table public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z_]{3,60}$'),
  title_template text not null check (char_length(title_template) <= 200),
  body_template text not null check (char_length(body_template) <= 2000),
  is_active boolean not null default true,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger notification_templates_updated_at before update on public.notification_templates
  for each row execute function public.set_updated_at();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (char_length(type) <= 60),
  title text not null check (char_length(title) <= 200),
  body text not null default '' check (char_length(body) <= 2000),
  link text check (link is null or (char_length(link) <= 300 and link like '/%')),
  dedupe_key text check (dedupe_key is null or char_length(dedupe_key) <= 200),
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index notifications_dedupe_uidx on public.notifications (user_id, dedupe_key) where dedupe_key is not null;
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{3,60}$'),
  name text not null,
  description text not null,
  icon text not null default 'award',
  category text not null default 'general',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  achievement_id uuid not null references public.achievements (id) on delete cascade,
  awarded_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);

-- ---------------------------------------------------------------------------
-- Platform administration
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_email text,
  action text not null check (char_length(action) <= 80),
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id);

create table public.platform_settings (
  key text primary key check (key ~ '^[a-z_]{3,60}$'),
  value jsonb not null,
  is_public boolean not null default false,
  description text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.app_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  source text not null default 'server' check (source in ('server', 'client', 'cron', 'auth')),
  message text not null check (char_length(message) <= 2000),
  digest text,
  path text,
  created_at timestamptz not null default now()
);
create index app_errors_created_idx on public.app_errors (created_at desc);

create table public.user_activity (
  user_id uuid not null references public.profiles (id) on delete cascade,
  activity_date date not null,
  primary key (user_id, activity_date)
);
create index user_activity_date_idx on public.user_activity (activity_date);

create table public.rate_limits (
  bucket_key text primary key,
  hits int not null default 0,
  window_started_at timestamptz not null default now()
);
