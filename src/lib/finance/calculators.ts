import Decimal from "decimal.js";
import { amortize, calculateEmi } from "./debt";
import { sipFutureValue } from "./investments";

/**
 * Pure calculator functions. Inputs/outputs are in major units (plain numbers
 * from form inputs) but all arithmetic runs through decimal.js and results are
 * rounded to 2 decimal places at the end. These are estimates, not guarantees.
 */

const r2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
const D = (n: number) => new Decimal(Number.isFinite(n) ? n : 0);

export type CompoundingFrequency = 1 | 2 | 4 | 12 | 365;

export function compoundInterest(principal: number, annualRatePct: number, years: number, compoundsPerYear: CompoundingFrequency = 12, monthlyContribution = 0) {
  const n = compoundsPerYear;
  const r = D(annualRatePct).div(100);
  const periods = D(years).mul(n);
  const growth = r.isZero() ? D(1) : r.div(n).plus(1).pow(periods);
  let fv = D(principal).mul(growth);
  let contributed = D(0);
  if (monthlyContribution > 0) {
    // Contributions at month end, compounded at the equivalent monthly rate.
    const months = D(years).mul(12).toNumber();
    const monthlyRate = r.isZero() ? D(0) : r.div(n).plus(1).pow(D(n).div(12)).minus(1);
    const fvContrib = monthlyRate.isZero()
      ? D(monthlyContribution).mul(months)
      : D(monthlyContribution).mul(monthlyRate.plus(1).pow(months).minus(1).div(monthlyRate));
    fv = fv.plus(fvContrib);
    contributed = D(monthlyContribution).mul(months);
  }
  const totalInvested = D(principal).plus(contributed);
  return { futureValue: r2(fv), totalInvested: r2(totalInvested), interestEarned: r2(fv.minus(totalInvested)) };
}

export function simpleInterest(principal: number, annualRatePct: number, years: number) {
  const interest = D(principal).mul(annualRatePct).mul(years).div(100);
  return { interest: r2(interest), totalAmount: r2(D(principal).plus(interest)) };
}

export function sipCalculator(monthly: number, annualReturnPct: number, years: number) {
  const months = Math.round(years * 12);
  // Work in paise-equivalent (×100) through the shared implementation.
  const res = sipFutureValue(Math.round(monthly * 100), annualReturnPct, months);
  return { invested: res.investedMinor / 100, futureValue: res.futureValueMinor / 100, gains: res.gainsMinor / 100 };
}

export function emiCalculator(principal: number, annualRatePct: number, tenureMonths: number) {
  const emiMinor = calculateEmi(Math.round(principal * 100), annualRatePct, Math.round(tenureMonths));
  const sched = amortize({ balanceMinor: Math.round(principal * 100), annualRatePct, paymentMinor: emiMinor });
  return {
    emi: emiMinor / 100,
    totalPayment: sched.totalPaidMinor / 100,
    totalInterest: sched.totalInterestMinor / 100,
  };
}

export function loanRepaymentCalculator(balance: number, annualRatePct: number, monthlyPayment: number, extraMonthly = 0) {
  const base = amortize({ balanceMinor: Math.round(balance * 100), annualRatePct, paymentMinor: Math.round(monthlyPayment * 100) });
  const fast = amortize({ balanceMinor: Math.round(balance * 100), annualRatePct, paymentMinor: Math.round(monthlyPayment * 100), extraPaymentMinor: Math.round(extraMonthly * 100) });
  return {
    neverPaysOff: base.neverPaysOff,
    months: base.periods,
    totalInterest: base.totalInterestMinor / 100,
    totalPaid: base.totalPaidMinor / 100,
    withExtra: { months: fast.periods, totalInterest: fast.totalInterestMinor / 100, neverPaysOff: fast.neverPaysOff },
    interestSaved: Math.max(0, (base.totalInterestMinor - fast.totalInterestMinor) / 100),
    monthsSaved: Math.max(0, base.periods - fast.periods),
  };
}

export function savingsGoalCalculator(target: number, current: number, months: number, annualReturnPct = 0) {
  const remaining = Decimal.max(0, D(target).minus(current));
  if (months <= 0) return { monthlyRequired: r2(remaining), weeklyRequired: r2(remaining), dailyRequired: r2(remaining), remaining: r2(remaining) };
  const i = D(annualReturnPct).div(1200);
  // Grow current savings, then solve the ordinary annuity for the gap.
  const grownCurrent = D(current).mul(i.plus(1).pow(months));
  const gap = Decimal.max(0, D(target).minus(grownCurrent));
  const monthly = i.isZero() ? gap.div(months) : gap.mul(i).div(i.plus(1).pow(months).minus(1));
  const days = D(months).mul(365).div(12);
  return {
    remaining: r2(remaining),
    monthlyRequired: r2(monthly),
    weeklyRequired: r2(i.isZero() ? gap.div(days.div(7)) : monthly.mul(12).div(52)),
    dailyRequired: r2(i.isZero() ? gap.div(days) : monthly.mul(12).div(365)),
  };
}

export function retirementCalculator(opts: {
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  monthlyExpensesToday: number;
  inflationPct: number;
  preRetirementReturnPct: number;
  postRetirementReturnPct: number;
  currentSavings: number;
}) {
  const yearsToRetire = Math.max(0, opts.retirementAge - opts.currentAge);
  const yearsInRetirement = Math.max(0, opts.lifeExpectancy - opts.retirementAge);
  const inflation = D(opts.inflationPct).div(100);
  const monthlyAtRetirement = D(opts.monthlyExpensesToday).mul(inflation.plus(1).pow(yearsToRetire));
  // Corpus = PV of an inflation-growing annual withdrawal (annuity due) at the real post-retirement rate.
  const post = D(opts.postRetirementReturnPct).div(100);
  const real = post.plus(1).div(inflation.plus(1)).minus(1);
  const annual = monthlyAtRetirement.mul(12);
  const corpus = real.abs().lt(1e-9)
    ? annual.mul(yearsInRetirement)
    : annual.mul(D(1).minus(real.plus(1).pow(-yearsInRetirement)).div(real)).mul(real.plus(1));
  const pre = D(opts.preRetirementReturnPct).div(1200);
  const months = yearsToRetire * 12;
  const fvCurrent = D(opts.currentSavings).mul(pre.plus(1).pow(months));
  const gap = Decimal.max(0, corpus.minus(fvCurrent));
  const monthlySip = months === 0 ? gap : pre.isZero() ? gap.div(months) : gap.mul(pre).div(pre.plus(1).pow(months).minus(1).mul(pre.plus(1)));
  return {
    yearsToRetire,
    monthlyExpenseAtRetirement: r2(monthlyAtRetirement),
    corpusRequired: r2(corpus),
    currentSavingsFutureValue: r2(fvCurrent),
    shortfall: r2(gap),
    monthlyInvestmentRequired: r2(monthlySip),
  };
}

export function inflationCalculator(amount: number, inflationPct: number, years: number) {
  const factor = D(inflationPct).div(100).plus(1).pow(years);
  return { futureCost: r2(D(amount).mul(factor)), purchasingPower: r2(D(amount).div(factor)) };
}

/** 50/30/20 style split with customisable percentages. */
export function monthlyBudgetCalculator(monthlyIncome: number, needsPct = 50, wantsPct = 30, savingsPct = 20) {
  const total = needsPct + wantsPct + savingsPct;
  const valid = total === 100;
  const part = (p: number) => r2(D(monthlyIncome).mul(p).div(100));
  return { valid, needs: part(needsPct), wants: part(wantsPct), savings: part(savingsPct), total };
}

export function investmentReturnCalculator(invested: number, currentValue: number, years: number) {
  const absolute = D(currentValue).minus(invested);
  const absolutePct = D(invested).isZero() ? D(0) : absolute.div(invested).mul(100);
  const cagr = D(invested).lte(0) || D(currentValue).lte(0) || years <= 0
    ? D(0)
    : D(currentValue).div(invested).pow(D(1).div(years)).minus(1).mul(100);
  return { absoluteReturn: r2(absolute), absoluteReturnPct: r2(absolutePct), cagrPct: r2(cagr) };
}

export function emergencyFundCalculator(monthlyEssentialExpenses: number, months: number, currentFund: number, monthlyContribution = 0) {
  const target = D(monthlyEssentialExpenses).mul(months);
  const gap = Decimal.max(0, target.minus(currentFund));
  const monthsToGoal = monthlyContribution > 0 ? gap.div(monthlyContribution).ceil().toNumber() : null;
  return { target: r2(target), gap: r2(gap), coveragePct: target.isZero() ? 100 : r2(Decimal.min(100, D(currentFund).div(target).mul(100))), monthsToGoal };
}

/** FI number = annual expenses / safe withdrawal rate; years to reach via monthly investing. */
export function financialIndependenceCalculator(opts: { annualExpenses: number; withdrawalRatePct: number; currentInvestments: number; monthlyInvestment: number; expectedReturnPct: number }) {
  const fiNumber = opts.withdrawalRatePct > 0 ? D(opts.annualExpenses).div(D(opts.withdrawalRatePct).div(100)) : D(0);
  const i = D(opts.expectedReturnPct).div(1200);
  let balance = D(opts.currentInvestments);
  let months = 0;
  if (balance.lt(fiNumber)) {
    if (opts.monthlyInvestment <= 0 && i.lte(0)) {
      return { fiNumber: r2(fiNumber), yearsToFI: null as number | null, reachable: false };
    }
    while (balance.lt(fiNumber) && months < 1200) {
      balance = balance.mul(i.plus(1)).plus(opts.monthlyInvestment);
      months++;
    }
  }
  const reachable = balance.gte(fiNumber);
  return { fiNumber: r2(fiNumber), yearsToFI: reachable ? r2(D(months).div(12)) : null, reachable };
}
