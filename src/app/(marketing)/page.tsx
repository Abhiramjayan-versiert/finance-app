import Link from "next/link";
import { BarChart3, Calculator, CreditCard, Gauge, Landmark, Lock, PiggyBank, Receipt, ShieldCheck, Smartphone, Target, TrendingUp, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";

const FEATURES = [
  { icon: Receipt, title: "Expense tracking", body: "Daily, weekly, monthly and yearly views, a spending calendar, categories and subcategories, receipts and recurring bills." },
  { icon: Target, title: "Goal & purchase planner", body: "Want a ₹1,80,000 MacBook in 12 months? See exactly what to save per day, week and month — and whether your income supports every goal." },
  { icon: Gauge, title: "Budgets with alerts", body: "Overall and category budgets with warnings at 50%, 75%, 90% and 100% — or thresholds you choose." },
  { icon: PiggyBank, title: "Savings buckets", body: "Emergency, travel, laptop or house funds. Transfers never count as income or spending, so nothing is double-counted." },
  { icon: TrendingUp, title: "Investment tracker", body: "Stocks, mutual funds, SIPs, FDs, gold and more with returns, allocation and clearly labelled projections." },
  { icon: CreditCard, title: "Debt & EMI manager", body: "Repayment progress, interest paid, EMI reminders, prepayment scenarios and your estimated debt-free date." },
  { icon: Landmark, title: "Net worth", body: "Assets minus liabilities, monthly history and a breakdown that counts every rupee exactly once." },
  { icon: BarChart3, title: "Reports & exports", body: "Ten report types with CSV, Excel and PDF export — all built from your actual records." },
  { icon: Calculator, title: "12 calculators", body: "SIP, EMI, compound interest, retirement, inflation, FI number and more, with precise decimal maths." },
  { icon: Trophy, title: "Habits & achievements", body: "Streaks, monthly challenges and badges that reward tracking and saving — never spending." },
];

export default function LandingPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
        <p className="glass mb-5 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-muted"><span className="size-1.5 rounded-full bg-accent" /> Free for everyone · Installable on phone & desktop</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.03em] sm:text-6xl">Your Money. Your Goals. <span className="text-accent">Your Future.</span></h1>
        <p className="mt-5 max-w-2xl text-base text-muted sm:text-lg">FINANCE OS is a private, all-in-one workspace to track spending and income, plan purchases, build savings, follow investments, pay down debt and watch your net worth grow.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" asChild><Link href="/register">Create your free account</Link></Button>
          <Button size="lg" variant="secondary" asChild><Link href="/tools/calculators">Try the calculators</Link></Button>
        </div>
        <dl className="glass mt-14 grid max-w-3xl grid-cols-2 gap-6 rounded-[26px] p-6 sm:grid-cols-4">
          {[["₹0", "Forever free"], ["12", "Calculators"], ["10", "Report types"], ["100%", "Your data, private"]].map(([v, l]) => (
            <div key={l}><dt className="text-2xl font-semibold tabular">{v}</dt><dd className="text-xs text-muted">{l}</dd></div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="how" className="mx-auto max-w-6xl px-4 pb-6 sm:px-6">
        <h2 id="how" className="text-2xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            ["1", "Create a free account", "Just your name, email and a password. No bank login, ever."],
            ["2", "Add what you earn and spend", "Type it in, or import a bank statement CSV. A checklist guides you through setup."],
            ["3", "Plan and watch it grow", "Set budgets and goals; see exactly what to save each month and your net worth over time."],
          ].map(([n, t, b]) => (
            <li key={n} className="glass rounded-[22px] p-5">
              <span className="flex size-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">{n}</span>
              <h3 className="mt-3 font-medium">{t}</h3>
              <p className="mt-1 text-sm text-muted">{b}</p>
            </li>
          ))}
        </ol>
      </section>
      <section id="features">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">Everything your money needs, in one place</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="glass rounded-[22px] p-5">
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft"><f.icon className="size-5 text-accent" /></span>
                <h3 className="mt-3 font-medium">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section id="security" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Private by design</h2>
            <p className="mt-3 text-muted">Your records live in your own private, server-guarded workspace — browsers can never query the database directly, and only you can read your data. Not even platform administrators can browse your transactions.</p>
          </div>
          <ul className="space-y-3 text-sm">
            {[
              [ShieldCheck, "Database locked to the server; every query scoped to your verified account"],
              [Lock, "Email verification and rate-limited sign-in"],
              [Landmark, "We never ask for bank passwords, OTPs or card numbers"],
              [Smartphone, "Installable app with an offline-friendly shell — sensitive data is never cached offline"],
            ].map(([Icon, text]) => {
              const I = Icon as typeof ShieldCheck;
              return <li key={text as string} className="flex gap-3 glass rounded-[22px] p-3"><I className="size-4 shrink-0 text-accent" /> {text as string}</li>;
            })}
          </ul>
        </div>
      </section>
      <section className="px-4 sm:px-6">
        <div className="glass mx-auto flex max-w-6xl flex-col items-start gap-4 rounded-[28px] px-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <div><h2 className="text-xl font-semibold">Start planning today</h2><p className="text-sm text-muted">It takes under a minute to set up your workspace.</p></div>
          <Button size="lg" asChild><Link href="/register">Get started — it&apos;s free</Link></Button>
        </div>
      </section>
    </>
  );
}
