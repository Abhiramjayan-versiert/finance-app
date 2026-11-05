/** Row types mirroring supabase/migrations. Money columns are integer minor units. */

export type UUID = string;
export type ISODate = string;
export type Timestamp = string;

export type TransactionType = "income" | "expense";
export type TransactionStatus = "completed" | "expected";
export type PaymentMethod = "cash" | "upi" | "debit_card" | "credit_card" | "bank_transfer" | "other";
export type Frequency = "daily" | "weekly" | "monthly" | "yearly";
export type AppRole = "super_admin" | "admin" | "support";

export interface Profile {
  id: UUID;
  full_name: string;
  email: string;
  avatar_url: string | null;
  country: string;
  status: "active" | "suspended";
  suspended_reason: string | null;
  terms_accepted_at: Timestamp | null;
  onboarded_at: Timestamp | null;
  last_seen_at: Timestamp | null;
  created_at: Timestamp;
  deleted_at: Timestamp | null;
}

export interface NotificationPrefs {
  budget_warnings: boolean;
  goal_deadlines: boolean;
  emi_reminders: boolean;
  recurring_reminders: boolean;
  monthly_summary: boolean;
  milestones: boolean;
  email: boolean;
}

export interface UserSettings {
  user_id: UUID;
  currency: string;
  locale: string;
  timezone: string;
  date_format: string;
  fy_start_month: number;
  theme: "dark" | "light" | "system";
  opening_balance_minor: number;
  net_worth_cash_source: "tracked" | "manual";
  default_payment_method: PaymentMethod;
  notification_prefs: NotificationPrefs;
}

export interface Category {
  id: UUID;
  user_id: UUID;
  name: string;
  icon: string;
  color: string;
  is_default: boolean;
  archived: boolean;
  parent_id?: UUID | null;
}

export interface Transaction {
  id: UUID;
  user_id: UUID;
  type: TransactionType;
  status: TransactionStatus;
  title: string;
  amount_minor: number;
  currency: string;
  income_category_id: UUID | null;
  expense_category_id: UUID | null;
  occurred_on: ISODate;
  payment_method: PaymentMethod;
  merchant: string | null;
  source: string | null;
  notes: string | null;
  receipt_path: string | null;
  is_recurring: boolean;
  recurring_id: UUID | null;
  occurrence_date: ISODate | null;
  created_at: Timestamp;
  deleted_at: Timestamp | null;
}

export interface RecurringTransaction {
  id: UUID;
  user_id: UUID;
  type: TransactionType;
  title: string;
  amount_minor: number;
  currency: string;
  income_category_id: UUID | null;
  expense_category_id: UUID | null;
  payment_method: PaymentMethod;
  merchant: string | null;
  source: string | null;
  notes: string | null;
  frequency: Frequency;
  interval_count: number;
  start_date: ISODate;
  end_date: ISODate | null;
  last_generated_date: ISODate | null;
  is_active: boolean;
  created_at: Timestamp;
}

export interface Budget {
  id: UUID;
  user_id: UUID;
  name: string;
  period: "monthly" | "yearly";
  expense_category_id: UUID | null;
  amount_minor: number;
  thresholds: number[];
  start_date: ISODate;
  end_date: ISODate | null;
  created_at: Timestamp;
}

export interface SavingsAccount {
  id: UUID;
  user_id: UUID;
  name: string;
  kind: string;
  target_amount_minor: number | null;
  monthly_target_minor: number | null;
  color: string;
  archived: boolean;
  created_at: Timestamp;
}

export interface SavingsTransaction {
  id: UUID;
  account_id: UUID;
  type: "deposit" | "withdrawal" | "transfer_in" | "transfer_out";
  amount_minor: number;
  affects_cash: boolean;
  transfer_group: UUID | null;
  occurred_on: ISODate;
  note: string | null;
  created_at: Timestamp;
}

export interface FinancialGoal {
  id: UUID;
  user_id: UUID;
  name: string;
  category: string;
  product_category: string | null;
  description: string | null;
  target_amount_minor: number;
  target_date: ISODate;
  priority: "low" | "medium" | "high";
  status: "not_started" | "active" | "paused" | "cancelled" | "completed";
  image_path: string | null;
  product_url: string | null;
  savings_account_id: UUID | null;
  completed_at: Timestamp | null;
  created_at: Timestamp;
}

export interface GoalContribution {
  id: UUID;
  goal_id: UUID;
  amount_minor: number;
  affects_cash: boolean;
  occurred_on: ISODate;
  note: string | null;
  created_at: Timestamp;
}

export type AssetClass = "stock" | "mutual_fund" | "sip" | "etf" | "fixed_deposit" | "recurring_deposit" | "gold" | "digital_asset" | "bond" | "other";

export interface Investment {
  id: UUID;
  user_id: UUID;
  name: string;
  asset_type: AssetClass;
  symbol: string | null;
  purchase_date: ISODate;
  current_value_minor: number;
  current_value_as_of: ISODate | null;
  notes: string | null;
  sip_monthly_minor: number | null;
  sip_start_date: ISODate | null;
  sip_duration_months: number | null;
  expected_return_pct: number | null;
  created_at: Timestamp;
}

export interface InvestmentTransaction {
  id: UUID;
  investment_id: UUID;
  type: "buy" | "sell" | "valuation";
  amount_minor: number;
  units: number | null;
  price_per_unit_minor: number | null;
  affects_cash: boolean;
  occurred_on: ISODate;
  note: string | null;
  created_at: Timestamp;
}

export interface Debt {
  id: UUID;
  user_id: UUID;
  name: string;
  kind: "personal" | "education" | "vehicle" | "home" | "credit_card" | "other";
  lender: string | null;
  principal_minor: number;
  opening_outstanding_minor: number;
  interest_rate: number;
  emi_minor: number | null;
  payment_frequency: "weekly" | "monthly" | "quarterly" | "yearly";
  start_date: ISODate;
  end_date: ISODate | null;
  next_due_date: ISODate | null;
  notes: string | null;
  closed_at: Timestamp | null;
  created_at: Timestamp;
}

export interface DebtPayment {
  id: UUID;
  debt_id: UUID;
  amount_minor: number;
  principal_minor: number;
  interest_minor: number;
  affects_cash: boolean;
  paid_on: ISODate;
  note: string | null;
  created_at: Timestamp;
}

export interface ManualAsset {
  id: UUID;
  name: string;
  type: "cash" | "bank_account" | "property" | "vehicle" | "gold" | "other";
  value_minor: number;
  as_of: ISODate;
  notes: string | null;
}

export interface ManualLiability {
  id: UUID;
  name: string;
  type: "credit_card" | "personal_debt" | "other";
  amount_minor: number;
  as_of: ISODate;
  notes: string | null;
}

export interface FinancialSnapshot {
  id: UUID;
  snapshot_month: ISODate;
  total_assets_minor: number;
  total_liabilities_minor: number;
  net_worth_minor: number;
  breakdown: Record<string, unknown>;
}

export interface AppNotification {
  id: UUID;
  type: string;
  title: string;
  body: string;
  link: string | null;
  dedupe_key: string | null;
  read_at: Timestamp | null;
  emailed_at: Timestamp | null;
  created_at: Timestamp;
}

export interface Achievement {
  id: UUID;
  code: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  sort_order: number;
}

export interface CashSummary {
  opening_balance_minor: number;
  income_minor: number;
  expense_minor: number;
  savings_net_minor: number;
  goals_net_minor: number;
  investments_net_minor: number;
  debt_payments_minor: number;
  cash_balance_minor: number;
}
