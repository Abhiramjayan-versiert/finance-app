"use client";

import { useMemo, useState } from "react";
import * as C from "@/lib/finance/calculators";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { EstimateNote } from "@/components/shared/states";
import { cn } from "@/lib/utils";

type Fmt = (n: number) => string;

function useNum(initial: number) {
  const [raw, setRaw] = useState(String(initial));
  const n = Number(raw.replace(/,/g, ""));
  return { raw, setRaw, value: Number.isFinite(n) ? n : NaN, valid: raw.trim() !== "" && Number.isFinite(n) };
}

function NumInput({ id, label, state, suffix, min = 0, max }: { id: string; label: string; state: ReturnType<typeof useNum>; suffix?: string; min?: number; max?: number }) {
  const out = state.valid && (state.value < min || (max !== undefined && state.value > max));
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted">{label}</Label>
      <div className="relative">
        <Input id={id} inputMode="decimal" value={state.raw} onChange={(e) => state.setRaw(e.target.value)} aria-invalid={!state.valid || out || undefined} className={cn("tabular", suffix && "pr-14")} />
        {suffix ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{suffix}</span> : null}
      </div>
      {!state.valid ? <p className="text-[11px] text-danger">Enter a number</p> : out ? <p className="text-[11px] text-danger">Must be {max !== undefined ? `between ${min} and ${max}` : `at least ${min}`}</p> : null}
    </div>
  );
}

function Result({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-muted">{label}</span>
      <span className={cn("tabular", strong && "text-base font-semibold text-accent")}>{value}</span>
    </div>
  );
}

function Calc({ id, title, description, inputs, results }: { id: string; title: string; description: string; inputs: React.ReactNode; results: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-24">
      <CardHeader><div><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></div></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">{inputs}</div>
        <div className="mt-4 rounded-md bg-card-2 px-3 py-2">{results}</div>
      </CardContent>
    </Card>
  );
}

const ok = (...s: Array<ReturnType<typeof useNum>>) => s.every((x) => x.valid && x.value >= 0);
const dash = "—";

function Compound({ f }: { f: Fmt }) {
  const p = useNum(100000), r = useNum(8), y = useNum(10), mc = useNum(0);
  const [n, setN] = useState<C.CompoundingFrequency>(12);
  const res = useMemo(() => (ok(p, r, y, mc) ? C.compoundInterest(p.value, r.value, y.value, n, mc.value) : null), [p.value, r.value, y.value, mc.value, n, p.valid, r.valid, y.valid, mc.valid]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Calc id="compound" title="Compound interest" description="Growth with interest on interest." inputs={<>
      <NumInput id="ci-p" label="Principal" state={p} />
      <NumInput id="ci-r" label="Annual rate" state={r} suffix="%" max={100} />
      <NumInput id="ci-y" label="Years" state={y} max={100} />
      <div className="space-y-1"><Label htmlFor="ci-n" className="text-xs text-muted">Compounding</Label><NativeSelect id="ci-n" value={n} onChange={(e) => setN(Number(e.target.value) as C.CompoundingFrequency)}><option value={1}>Yearly</option><option value={2}>Half-yearly</option><option value={4}>Quarterly</option><option value={12}>Monthly</option><option value={365}>Daily</option></NativeSelect></div>
      <NumInput id="ci-m" label="Monthly addition" state={mc} />
    </>} results={res ? <><Result label="Future value" value={f(res.futureValue)} strong /><Result label="Total invested" value={f(res.totalInvested)} /><Result label="Interest earned" value={f(res.interestEarned)} /></> : <Result label="Future value" value={dash} />} />
  );
}

function Simple({ f }: { f: Fmt }) {
  const p = useNum(50000), r = useNum(8), y = useNum(3);
  const res = ok(p, r, y) ? C.simpleInterest(p.value, r.value, y.value) : null;
  return <Calc id="simple" title="Simple interest" description="Interest on the principal only." inputs={<><NumInput id="si-p" label="Principal" state={p} /><NumInput id="si-r" label="Annual rate" state={r} suffix="%" max={100} /><NumInput id="si-y" label="Years" state={y} max={100} /></>} results={res ? <><Result label="Interest" value={f(res.interest)} strong /><Result label="Total amount" value={f(res.totalAmount)} /></> : <Result label="Interest" value={dash} />} />;
}

function Sip({ f }: { f: Fmt }) {
  const m = useNum(5000), r = useNum(12), y = useNum(10);
  const res = ok(m, r, y) ? C.sipCalculator(m.value, r.value, y.value) : null;
  return <Calc id="sip" title="SIP calculator" description="Monthly investing with compounding returns." inputs={<><NumInput id="sip-m" label="Monthly investment" state={m} /><NumInput id="sip-r" label="Expected return" state={r} suffix="% p.a." max={100} /><NumInput id="sip-y" label="Years" state={y} max={60} /></>} results={res ? <><Result label="Estimated value" value={f(res.futureValue)} strong /><Result label="Invested" value={f(res.invested)} /><Result label="Estimated gains" value={f(res.gains)} /></> : <Result label="Estimated value" value={dash} />} />;
}

function Emi({ f }: { f: Fmt }) {
  const p = useNum(1000000), r = useNum(9.5), t = useNum(60);
  const res = ok(p, r, t) && t.value > 0 ? C.emiCalculator(p.value, r.value, t.value) : null;
  return <Calc id="emi" title="EMI calculator" description="Monthly instalment for a loan." inputs={<><NumInput id="emi-p" label="Loan amount" state={p} /><NumInput id="emi-r" label="Interest rate" state={r} suffix="% p.a." max={100} /><NumInput id="emi-t" label="Tenure" state={t} suffix="months" min={1} max={600} /></>} results={res ? <><Result label="Monthly EMI" value={f(res.emi)} strong /><Result label="Total interest" value={f(res.totalInterest)} /><Result label="Total payment" value={f(res.totalPayment)} /></> : <Result label="Monthly EMI" value={dash} />} />;
}

function Loan({ f }: { f: Fmt }) {
  const b = useNum(500000), r = useNum(10), pay = useNum(12000), x = useNum(2000);
  const res = ok(b, r, pay, x) ? C.loanRepaymentCalculator(b.value, r.value, pay.value, x.value) : null;
  return <Calc id="loan" title="Loan repayment" description="How long until it's paid off — and what extra payments save." inputs={<><NumInput id="lr-b" label="Outstanding balance" state={b} /><NumInput id="lr-r" label="Interest rate" state={r} suffix="% p.a." max={100} /><NumInput id="lr-p" label="Monthly payment" state={pay} /><NumInput id="lr-x" label="Extra per month" state={x} /></>} results={res ? res.neverPaysOff ? <p className="py-1 text-sm text-danger">This payment doesn&apos;t cover the monthly interest.</p> : <><Result label="Months to repay" value={String(res.months)} strong /><Result label="Total interest" value={f(res.totalInterest)} /><Result label="With extra payments" value={`${res.withExtra.months} months`} /><Result label="Interest saved" value={f(res.interestSaved)} /></> : <Result label="Months" value={dash} />} />;
}

function SavingsGoal({ f }: { f: Fmt }) {
  const t = useNum(180000), c = useNum(20000), mo = useNum(12), r = useNum(0);
  const res = ok(t, c, mo, r) ? C.savingsGoalCalculator(t.value, c.value, mo.value, r.value) : null;
  return <Calc id="goal" title="Savings goal" description="What to save to reach a target on time." inputs={<><NumInput id="sg-t" label="Target amount" state={t} /><NumInput id="sg-c" label="Already saved" state={c} /><NumInput id="sg-m" label="Months" state={mo} max={1200} /><NumInput id="sg-r" label="Return on savings" state={r} suffix="% p.a." max={100} /></>} results={res ? <><Result label="Monthly" value={f(res.monthlyRequired)} strong /><Result label="Weekly" value={f(res.weeklyRequired)} /><Result label="Daily" value={f(res.dailyRequired)} /><Result label="Remaining" value={f(res.remaining)} /></> : <Result label="Monthly" value={dash} />} />;
}

function Retirement({ f }: { f: Fmt }) {
  const age = useNum(30), ret = useNum(60), life = useNum(85), exp = useNum(50000), inf = useNum(6), pre = useNum(11), post = useNum(7), cur = useNum(500000);
  const valid = ok(age, ret, life, exp, inf, pre, post, cur) && ret.value >= age.value && life.value >= ret.value;
  const res = valid ? C.retirementCalculator({ currentAge: age.value, retirementAge: ret.value, lifeExpectancy: life.value, monthlyExpensesToday: exp.value, inflationPct: inf.value, preRetirementReturnPct: pre.value, postRetirementReturnPct: post.value, currentSavings: cur.value }) : null;
  return <Calc id="retirement" title="Retirement" description="Corpus needed to fund inflation-adjusted expenses." inputs={<><NumInput id="rt-a" label="Current age" state={age} max={100} /><NumInput id="rt-r" label="Retirement age" state={ret} max={100} /><NumInput id="rt-l" label="Life expectancy" state={life} max={120} /><NumInput id="rt-e" label="Monthly expenses today" state={exp} /><NumInput id="rt-i" label="Inflation" state={inf} suffix="%" max={30} /><NumInput id="rt-pre" label="Return before retiring" state={pre} suffix="%" max={50} /><NumInput id="rt-post" label="Return after retiring" state={post} suffix="%" max={50} /><NumInput id="rt-c" label="Current savings" state={cur} /></>} results={res ? <><Result label="Corpus required" value={f(res.corpusRequired)} strong /><Result label="Monthly expense at retirement" value={f(res.monthlyExpenseAtRetirement)} /><Result label="Savings will grow to" value={f(res.currentSavingsFutureValue)} /><Result label="Invest monthly" value={f(res.monthlyInvestmentRequired)} /></> : <p className="py-1 text-xs text-danger">Check that ages are in order.</p>} />;
}

function Inflation({ f }: { f: Fmt }) {
  const a = useNum(100000), r = useNum(6), y = useNum(10);
  const res = ok(a, r, y) ? C.inflationCalculator(a.value, r.value, y.value) : null;
  return <Calc id="inflation" title="Inflation" description="Future cost and today's purchasing power." inputs={<><NumInput id="in-a" label="Amount today" state={a} /><NumInput id="in-r" label="Inflation" state={r} suffix="% p.a." max={50} /><NumInput id="in-y" label="Years" state={y} max={100} /></>} results={res ? <><Result label="Future cost" value={f(res.futureCost)} strong /><Result label="Today's value of that amount then" value={f(res.purchasingPower)} /></> : <Result label="Future cost" value={dash} />} />;
}

function Budget({ f }: { f: Fmt }) {
  const inc = useNum(80000), n = useNum(50), w = useNum(30), s = useNum(20);
  const res = ok(inc, n, w, s) ? C.monthlyBudgetCalculator(inc.value, n.value, w.value, s.value) : null;
  return <Calc id="budget" title="Monthly budget (50/30/20)" description="Split income into needs, wants and savings." inputs={<><NumInput id="bd-i" label="Monthly income" state={inc} /><NumInput id="bd-n" label="Needs" state={n} suffix="%" max={100} /><NumInput id="bd-w" label="Wants" state={w} suffix="%" max={100} /><NumInput id="bd-s" label="Savings" state={s} suffix="%" max={100} /></>} results={res ? <>{!res.valid ? <p className="pb-1 text-xs text-warning">Percentages add up to {res.total}% (should be 100%).</p> : null}<Result label="Needs" value={f(res.needs)} /><Result label="Wants" value={f(res.wants)} /><Result label="Savings" value={f(res.savings)} strong /></> : <Result label="Savings" value={dash} />} />;
}

function Returns({ f }: { f: Fmt }) {
  const i = useNum(100000), c = useNum(165000), y = useNum(4);
  const res = ok(i, c, y) ? C.investmentReturnCalculator(i.value, c.value, y.value) : null;
  return <Calc id="returns" title="Investment return" description="Absolute return and CAGR." inputs={<><NumInput id="ir-i" label="Amount invested" state={i} /><NumInput id="ir-c" label="Current value" state={c} /><NumInput id="ir-y" label="Years held" state={y} max={100} /></>} results={res ? <><Result label="CAGR" value={`${res.cagrPct}%`} strong /><Result label="Absolute return" value={f(res.absoluteReturn)} /><Result label="Absolute return %" value={`${res.absoluteReturnPct}%`} /></> : <Result label="CAGR" value={dash} />} />;
}

function Emergency({ f }: { f: Fmt }) {
  const e = useNum(30000), mo = useNum(6), c = useNum(60000), add = useNum(10000);
  const res = ok(e, mo, c, add) ? C.emergencyFundCalculator(e.value, mo.value, c.value, add.value) : null;
  return <Calc id="emergency" title="Emergency fund" description="3–6 months of essential expenses is a common guideline." inputs={<><NumInput id="ef-e" label="Essential monthly expenses" state={e} /><NumInput id="ef-m" label="Months of cover" state={mo} max={36} /><NumInput id="ef-c" label="Current fund" state={c} /><NumInput id="ef-a" label="Monthly contribution" state={add} /></>} results={res ? <><Result label="Target fund" value={f(res.target)} strong /><Result label="Still needed" value={f(res.gap)} /><Result label="Coverage" value={`${res.coveragePct}%`} /><Result label="Months to target" value={res.monthsToGoal === null ? dash : String(res.monthsToGoal)} /></> : <Result label="Target" value={dash} />} />;
}

function Fi({ f }: { f: Fmt }) {
  const e = useNum(600000), w = useNum(4), c = useNum(500000), m = useNum(30000), r = useNum(10);
  const res = ok(e, w, c, m, r) && w.value > 0 ? C.financialIndependenceCalculator({ annualExpenses: e.value, withdrawalRatePct: w.value, currentInvestments: c.value, monthlyInvestment: m.value, expectedReturnPct: r.value }) : null;
  return <Calc id="fi" title="Financial independence" description="Your FI number and time to reach it." inputs={<><NumInput id="fi-e" label="Annual expenses" state={e} /><NumInput id="fi-w" label="Safe withdrawal rate" state={w} suffix="%" min={0.1} max={20} /><NumInput id="fi-c" label="Current investments" state={c} /><NumInput id="fi-m" label="Monthly investment" state={m} /><NumInput id="fi-r" label="Expected return" state={r} suffix="% p.a." max={50} /></>} results={res ? <><Result label="FI number" value={f(res.fiNumber)} strong /><Result label="Years to FI" value={res.reachable ? String(res.yearsToFI) : "Not reachable with these inputs"} /></> : <Result label="FI number" value={dash} />} />;
}

export const CALCULATOR_LINKS = [
  ["compound", "Compound interest"], ["simple", "Simple interest"], ["sip", "SIP"], ["emi", "EMI"], ["loan", "Loan repayment"], ["goal", "Savings goal"],
  ["retirement", "Retirement"], ["inflation", "Inflation"], ["budget", "Monthly budget"], ["returns", "Investment return"], ["emergency", "Emergency fund"], ["fi", "Financial independence"],
] as const;

export function CalculatorSuite({ currency = "INR", locale = "en-IN" }: { currency?: string; locale?: string }) {
  const nf = useMemo(() => new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }), [currency, locale]);
  const f: Fmt = (n) => (Number.isFinite(n) ? nf.format(n) : "—");
  return (
    <>
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Calculators">
        {CALCULATOR_LINKS.map(([id, l]) => <a key={id} href={`#${id}`} className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:border-border-strong hover:text-foreground">{l}</a>)}
      </nav>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Compound f={f} /><Simple f={f} /><Sip f={f} /><Emi f={f} /><Loan f={f} /><SavingsGoal f={f} />
        <Retirement f={f} /><Inflation f={f} /><Budget f={f} /><Returns f={f} /><Emergency f={f} /><Fi f={f} />
      </div>
      <EstimateNote className="mt-4">All calculators use precise decimal arithmetic. Results are estimates for planning — not financial advice or guaranteed returns.</EstimateNote>
    </>
  );
}
