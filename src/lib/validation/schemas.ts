import { z } from "zod";
import { checkbox, isoDate, money, optionalIsoDate, optionalMoney, optionalText, optionalUuid, percentNumber, requiredText, uuid } from "./common";

const paymentMethod = z.enum(["cash", "upi", "debit_card", "credit_card", "bank_transfer", "other"], { error: "Choose a payment method" });
const frequency = z.enum(["daily", "weekly", "monthly", "yearly"], { error: "Choose a frequency" });

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Use at most 72 characters")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number");

export const emailSchema = z.string().trim().toLowerCase().max(254).email("Enter a valid email address");

export const registerSchema = z
  .object({
    fullName: requiredText(120, "Full name"),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    terms: checkbox.refine((v) => v, "You must accept the terms to continue"),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Password is required").max(72) });
export const otpSchema = z.object({ email: emailSchema, token: z.string().trim().regex(/^\d{6,8}$/, "Enter the code from your email") });
export const emailOnlySchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z
  .object({ email: emailSchema, token: z.string().trim().regex(/^\d{6,8}$/, "Enter the code from your email"), password: passwordSchema, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });
export const changePasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------
export const transactionSchema = (currency: string) =>
  z
    .object({
      id: optionalUuid,
      clientRef: optionalUuid,
      type: z.enum(["income", "expense"]),
      status: z.enum(["completed", "expected"]).default("completed"),
      title: requiredText(120, "Title"),
      amount: money(currency),
      categoryId: optionalUuid,
      subcategoryId: optionalUuid,
      occurredOn: isoDate,
      paymentMethod,
      merchant: optionalText(120),
      source: optionalText(120),
      notes: optionalText(1000),
      receiptPath: optionalText(300),
      recurring: checkbox.default(false),
      frequency: frequency.optional(),
      intervalCount: z.coerce.number().int().min(1).max(365).default(1),
      endDate: optionalIsoDate,
    })
    .refine((d) => d.type === "income" || d.status === "completed", { path: ["status"], message: "Only income can be marked as expected" })
    .refine((d) => !d.recurring || !!d.frequency, { path: ["frequency"], message: "Choose how often this repeats" })
    .refine((d) => !d.recurring || !d.endDate || d.endDate >= d.occurredOn, { path: ["endDate"], message: "End date must be after the start date" });

export const recurringUpdateSchema = (currency: string) =>
  z.object({
    id: uuid,
    title: requiredText(120, "Title"),
    amount: money(currency),
    frequency,
    intervalCount: z.coerce.number().int().min(1).max(365),
    endDate: optionalIsoDate,
    isActive: checkbox,
  });

export const categorySchema = z.object({
  id: optionalUuid,
  kind: z.enum(["income", "expense"]),
  name: requiredText(60, "Name"),
  parentId: optionalUuid,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour").default("#A0A6AD"),
});

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------
export const budgetSchema = (currency: string) =>
  z.object({
    id: optionalUuid,
    name: requiredText(80, "Name"),
    period: z.enum(["monthly", "yearly"]),
    categoryId: optionalUuid,
    amount: money(currency, { label: "Budget amount" }),
    thresholds: z
      .string()
      .default("50,75,90,100")
      .transform((s, ctx) => {
        const parts = s.split(/[,\s]+/).filter(Boolean).map(Number);
        if (!parts.length || parts.length > 6 || parts.some((n) => !Number.isInteger(n) || n < 1 || n > 200)) {
          ctx.addIssue({ code: "custom", message: "Use 1–6 whole percentages between 1 and 200, e.g. 50,75,90,100" });
          return z.NEVER;
        }
        return [...new Set(parts)].sort((a, b) => a - b);
      }),
    startDate: isoDate,
    endDate: optionalIsoDate,
  });

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------
export const GOAL_CATEGORY_VALUES = ["gadgets", "vehicles", "travel", "education", "home", "business", "personal", "emergency_fund", "investments", "retirement", "other"] as const;

export const goalSchema = (currency: string) =>
  z.object({
    id: optionalUuid,
    name: requiredText(120, "Goal name"),
    category: z.enum(GOAL_CATEGORY_VALUES),
    productCategory: optionalText(80),
    description: optionalText(2000),
    targetAmount: money(currency, { label: "Target amount" }),
    currentSavings: optionalMoney(currency, "Current savings"),
    currentSavingsFromCash: checkbox.default(false),
    targetDate: isoDate,
    priority: z.enum(["low", "medium", "high"]),
    productUrl: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(500).url("Enter a valid URL").refine((u) => /^https?:\/\//i.test(u), "URL must start with http(s)://").nullable().optional()),
    savingsAccountId: optionalUuid,
    imagePath: optionalText(300),
    status: z.enum(["not_started", "active", "paused", "cancelled", "completed"]).optional(),
  });

export const goalContributionSchema = (currency: string) =>
  z.object({
    goalId: uuid,
    clientRef: optionalUuid,
    direction: z.enum(["add", "withdraw"]),
    amount: money(currency),
    affectsCash: checkbox.default(true),
    occurredOn: isoDate,
    note: optionalText(500),
  });

// ---------------------------------------------------------------------------
// Savings
// ---------------------------------------------------------------------------
export const savingsAccountSchema = (currency: string) =>
  z.object({
    id: optionalUuid,
    name: requiredText(80, "Name"),
    kind: z.enum(["emergency", "vacation", "gadget", "vehicle", "house", "education", "general", "other"]),
    targetAmount: optionalMoney(currency, "Target"),
    monthlyTarget: optionalMoney(currency, "Monthly target"),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#B7F34A"),
    openingBalance: optionalMoney(currency, "Opening balance"),
  });

export const savingsMovementSchema = (currency: string) =>
  z.object({
    accountId: uuid,
    clientRef: optionalUuid,
    type: z.enum(["deposit", "withdrawal"]),
    amount: money(currency),
    affectsCash: checkbox.default(true),
    occurredOn: isoDate,
    note: optionalText(500),
  });

export const savingsTransferSchema = (currency: string) =>
  z
    .object({ fromAccountId: uuid, toAccountId: uuid, amount: money(currency), occurredOn: isoDate, note: optionalText(500) })
    .refine((d) => d.fromAccountId !== d.toAccountId, { path: ["toAccountId"], message: "Choose a different account" });

// ---------------------------------------------------------------------------
// Investments
// ---------------------------------------------------------------------------
const assetClass = z.enum(["stock", "mutual_fund", "sip", "etf", "fixed_deposit", "recurring_deposit", "gold", "digital_asset", "bond", "other"]);
const optionalUnits = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().min(0, "Units cannot be negative").max(1e12).nullable());

export const investmentSchema = (currency: string) =>
  z.object({
    name: requiredText(120, "Name"),
    assetType: assetClass,
    symbol: optionalText(30),
    amountInvested: money(currency, { label: "Amount invested" }),
    purchaseDate: isoDate,
    units: optionalUnits,
    purchasePrice: optionalMoney(currency, "Purchase price"),
    currentValue: optionalMoney(currency, "Current value"),
    fromCash: checkbox.default(false),
    notes: optionalText(1000),
    sipMonthly: optionalMoney(currency, "Monthly contribution"),
    sipStartDate: optionalIsoDate,
    sipDurationMonths: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(1).max(600).nullable()),
    expectedReturnPct: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().min(-100).max(100).nullable()),
  });

export const investmentUpdateSchema = (currency: string) =>
  z.object({
    id: uuid,
    name: requiredText(120, "Name"),
    symbol: optionalText(30),
    notes: optionalText(1000),
    sipMonthly: optionalMoney(currency, "Monthly contribution"),
    sipStartDate: optionalIsoDate,
    sipDurationMonths: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(1).max(600).nullable()),
    expectedReturnPct: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().min(-100).max(100).nullable()),
  });

export const investmentTxSchema = (currency: string) =>
  z
    .object({
      investmentId: uuid,
      clientRef: optionalUuid,
      type: z.enum(["buy", "sell", "valuation"]),
      amount: money(currency, { allowZero: true }),
      units: optionalUnits,
      affectsCash: checkbox.default(false),
      occurredOn: isoDate,
      note: optionalText(500),
    })
    .refine((d) => d.type === "valuation" || d.amount > 0, { path: ["amount"], message: "Amount must be greater than zero" });

// ---------------------------------------------------------------------------
// Debts
// ---------------------------------------------------------------------------
export const debtSchema = (currency: string) =>
  z
    .object({
      id: optionalUuid,
      name: requiredText(120, "Loan name"),
      kind: z.enum(["personal", "education", "vehicle", "home", "credit_card", "other"]),
      lender: optionalText(120),
      principal: money(currency, { label: "Principal" }),
      outstanding: money(currency, { label: "Outstanding amount", allowZero: true }),
      interestRate: percentNumber(0, 100),
      emi: optionalMoney(currency, "EMI"),
      paymentFrequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
      startDate: isoDate,
      endDate: optionalIsoDate,
      nextDueDate: optionalIsoDate,
      notes: optionalText(1000),
    })
    .refine((d) => !d.endDate || d.endDate >= d.startDate, { path: ["endDate"], message: "End date must be after the start date" });

export const debtPaymentSchema = (currency: string) =>
  z.object({
    debtId: uuid,
    clientRef: optionalUuid,
    amount: money(currency),
    interest: optionalMoney(currency, "Interest"),
    autoSplit: checkbox.default(true),
    affectsCash: checkbox.default(true),
    paidOn: isoDate,
    note: optionalText(500),
  });

// ---------------------------------------------------------------------------
// Net worth
// ---------------------------------------------------------------------------
export const assetSchema = (currency: string) =>
  z.object({
    id: optionalUuid,
    name: requiredText(120, "Name"),
    type: z.enum(["cash", "bank_account", "property", "vehicle", "gold", "other"]),
    value: money(currency, { allowZero: true, label: "Value" }),
    asOf: isoDate,
    notes: optionalText(1000),
  });

export const liabilitySchema = (currency: string) =>
  z.object({
    id: optionalUuid,
    name: requiredText(120, "Name"),
    type: z.enum(["credit_card", "personal_debt", "other"]),
    amount: money(currency, { allowZero: true }),
    asOf: isoDate,
    notes: optionalText(1000),
  });

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export const profileSchema = z.object({
  fullName: requiredText(120, "Full name"),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use a 2-letter country code"),
});

export const preferencesSchema = (currency: string) =>
  z.object({
    currency: z.string().regex(/^[A-Z]{3}$/),
    locale: z.string().trim().min(2).max(20).regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/, "Invalid locale"),
    timezone: z.string().trim().min(1).max(60).refine((tz) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unknown time zone"),
    dateFormat: z.enum(["dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd", "dd MMM yyyy"]),
    fyStartMonth: z.coerce.number().int().min(1).max(12),
    theme: z.enum(["dark", "light", "system"]),
    defaultPaymentMethod: paymentMethod,
    openingBalance: money(currency, { allowZero: true, allowNegative: true, label: "Opening balance" }),
    netWorthCashSource: z.enum(["tracked", "manual"]),
  });

export const notificationPrefsSchema = z.object({
  budget_warnings: checkbox,
  goal_deadlines: checkbox,
  emi_reminders: checkbox,
  recurring_reminders: checkbox,
  monthly_summary: checkbox,
  milestones: checkbox,
  email: checkbox,
});
