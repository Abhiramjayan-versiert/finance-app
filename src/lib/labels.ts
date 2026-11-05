import type { PaymentMethod } from "@/types/database";

export const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "debit_card", label: "Debit card" },
  { value: "credit_card", label: "Credit card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other" },
];
export const PAYMENT_METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS.map((p) => [p.value, p.label])) as Record<PaymentMethod, string>;

export const GOAL_CATEGORIES = [
  { value: "gadgets", label: "Gadgets" },
  { value: "vehicles", label: "Vehicles" },
  { value: "travel", label: "Travel" },
  { value: "education", label: "Education" },
  { value: "home", label: "Home" },
  { value: "business", label: "Business" },
  { value: "personal", label: "Personal purchases" },
  { value: "emergency_fund", label: "Emergency fund" },
  { value: "investments", label: "Investments" },
  { value: "retirement", label: "Retirement" },
  { value: "other", label: "Other" },
] as const;
export const GOAL_CATEGORY_LABEL = Object.fromEntries(GOAL_CATEGORIES.map((c) => [c.value, c.label])) as Record<string, string>;

export const SAVINGS_KINDS = [
  { value: "emergency", label: "Emergency fund" },
  { value: "vacation", label: "Vacation fund" },
  { value: "gadget", label: "Gadget / laptop fund" },
  { value: "vehicle", label: "Car / vehicle fund" },
  { value: "house", label: "House deposit" },
  { value: "education", label: "Education fund" },
  { value: "general", label: "General savings" },
  { value: "other", label: "Other" },
] as const;
export const SAVINGS_KIND_LABEL = Object.fromEntries(SAVINGS_KINDS.map((c) => [c.value, c.label])) as Record<string, string>;

export const ASSET_CLASSES = [
  { value: "stock", label: "Stocks" },
  { value: "mutual_fund", label: "Mutual funds" },
  { value: "sip", label: "SIP" },
  { value: "etf", label: "ETFs" },
  { value: "fixed_deposit", label: "Fixed deposit" },
  { value: "recurring_deposit", label: "Recurring deposit" },
  { value: "gold", label: "Gold" },
  { value: "digital_asset", label: "Digital assets" },
  { value: "bond", label: "Bonds" },
  { value: "other", label: "Other" },
] as const;

export const DEBT_KINDS = [
  { value: "personal", label: "Personal loan" },
  { value: "education", label: "Education loan" },
  { value: "vehicle", label: "Vehicle loan" },
  { value: "home", label: "Home loan" },
  { value: "credit_card", label: "Credit card balance" },
  { value: "other", label: "Other borrowing" },
] as const;
export const DEBT_KIND_LABEL = Object.fromEntries(DEBT_KINDS.map((c) => [c.value, c.label])) as Record<string, string>;

export const FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
] as const;

export const PAYMENT_FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
] as const;

export const MANUAL_ASSET_TYPES = [
  { value: "bank_account", label: "Bank balance" },
  { value: "cash", label: "Cash in hand" },
  { value: "property", label: "Property" },
  { value: "vehicle", label: "Vehicle" },
  { value: "gold", label: "Gold / jewellery" },
  { value: "other", label: "Other asset" },
] as const;

export const MANUAL_LIABILITY_TYPES = [
  { value: "credit_card", label: "Credit card balance" },
  { value: "personal_debt", label: "Personal debt" },
  { value: "other", label: "Other liability" },
] as const;

export const PRIORITIES = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;
