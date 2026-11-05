import Decimal from "decimal.js";
import { addDaysISO, addMonthsISO, type ISODate } from "./dates";

export type PaymentFrequency = "weekly" | "monthly" | "quarterly" | "yearly";

export const PERIODS_PER_YEAR: Record<PaymentFrequency, number> = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 };

function periodicRate(annualRatePct: number, frequency: PaymentFrequency = "monthly"): Decimal {
  return new Decimal(annualRatePct).div(100).div(PERIODS_PER_YEAR[frequency]);
}

/**
 * Standard EMI: P·r·(1+r)^n / ((1+r)^n − 1). Zero-interest loans divide evenly.
 * Returns minor units rounded half-up.
 */
export function calculateEmi(principalMinor: number, annualRatePct: number, periods: number, frequency: PaymentFrequency = "monthly"): number {
  if (principalMinor <= 0 || periods <= 0) return 0;
  const r = periodicRate(annualRatePct, frequency);
  if (r.isZero()) return new Decimal(principalMinor).div(periods).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  const f = r.plus(1).pow(periods);
  return new Decimal(principalMinor).mul(r).mul(f).div(f.minus(1)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export interface AmortizationRow {
  period: number;
  date: ISODate | null;
  paymentMinor: number;
  principalMinor: number;
  interestMinor: number;
  balanceMinor: number;
}

export interface AmortizationResult {
  schedule: AmortizationRow[];
  totalPaidMinor: number;
  totalInterestMinor: number;
  periods: number;
  payoffDate: ISODate | null;
  /** True when the payment does not cover the interest, so the debt never ends. */
  neverPaysOff: boolean;
}

const MONTHS_PER_PERIOD: Record<PaymentFrequency, number> = { weekly: 0, monthly: 1, quarterly: 3, yearly: 12 };

/**
 * Amortisation schedule for a balance with a fixed periodic payment and an
 * optional extra (prepayment) every period. Final payment is trimmed.
 */
export function amortize(opts: {
  balanceMinor: number;
  annualRatePct: number;
  paymentMinor: number;
  extraPaymentMinor?: number;
  frequency?: PaymentFrequency;
  startDate?: ISODate | null;
  maxPeriods?: number;
}): AmortizationResult {
  const frequency = opts.frequency ?? "monthly";
  const r = periodicRate(opts.annualRatePct, frequency);
  const pay = opts.paymentMinor + (opts.extraPaymentMinor ?? 0);
  const maxPeriods = opts.maxPeriods ?? 1200;
  let balance = new Decimal(opts.balanceMinor);
  const schedule: AmortizationRow[] = [];
  let totalPaid = 0;
  let totalInterest = 0;

  const firstInterest = balance.mul(r).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  if (opts.balanceMinor > 0 && pay <= firstInterest) {
    return { schedule: [], totalPaidMinor: 0, totalInterestMinor: 0, periods: 0, payoffDate: null, neverPaysOff: true };
  }

  for (let p = 1; balance.gt(0) && p <= maxPeriods; p++) {
    const interest = balance.mul(r).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    let payment = pay;
    let principal = payment - interest;
    if (principal >= balance.toNumber()) {
      principal = balance.toNumber();
      payment = principal + interest;
    }
    balance = balance.minus(principal);
    totalPaid += payment;
    totalInterest += interest;
    let date: ISODate | null = null;
    if (opts.startDate) {
      date = frequency === "weekly"
        ? addDaysISO(opts.startDate, (p - 1) * 7)
        : addMonthsISO(opts.startDate, (p - 1) * MONTHS_PER_PERIOD[frequency]);
    }
    schedule.push({ period: p, date, paymentMinor: payment, principalMinor: principal, interestMinor: interest, balanceMinor: balance.toNumber() });
  }
  return {
    schedule,
    totalPaidMinor: totalPaid,
    totalInterestMinor: totalInterest,
    periods: schedule.length,
    payoffDate: schedule.length ? schedule[schedule.length - 1].date : null,
    neverPaysOff: balance.gt(0),
  };
}

/** Split a payment into interest (on outstanding balance for one period) and principal. */
export function splitPayment(paymentMinor: number, outstandingMinor: number, annualRatePct: number, frequency: PaymentFrequency = "monthly") {
  const interest = Math.min(
    paymentMinor,
    new Decimal(outstandingMinor).mul(periodicRate(annualRatePct, frequency)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
  );
  const principal = Math.min(outstandingMinor, paymentMinor - interest);
  return { interestMinor: paymentMinor - principal, principalMinor: principal };
}

/** Compare the base plan with a prepayment scenario. */
export function compareRepayment(opts: {
  balanceMinor: number;
  annualRatePct: number;
  paymentMinor: number;
  extraPaymentMinor: number;
  frequency?: PaymentFrequency;
  startDate?: ISODate | null;
}) {
  const base = amortize({ ...opts, extraPaymentMinor: 0 });
  const faster = amortize(opts);
  return {
    base,
    faster,
    interestSavedMinor: Math.max(0, base.totalInterestMinor - faster.totalInterestMinor),
    periodsSaved: Math.max(0, base.periods - faster.periods),
  };
}

export function repaymentProgress(principalMinor: number, outstandingMinor: number): number {
  if (principalMinor <= 0) return 100;
  return Math.min(100, Math.max(0, new Decimal(principalMinor - outstandingMinor).div(principalMinor).mul(100).toDecimalPlaces(2).toNumber()));
}
