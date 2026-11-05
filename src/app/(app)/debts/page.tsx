import type { Metadata } from "next";
import { CalendarCheck, CreditCard, Percent, Wallet } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { getDebts } from "@/server/queries/finance";
import { rollForwardDueDate } from "@/server/maintenance";
import { amortize } from "@/lib/finance/debt";
import { formatMoney } from "@/lib/finance/money";
import { formatDisplayDate } from "@/lib/finance/dates";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState, EstimateNote } from "@/components/shared/states";
import { DebtCard, NewDebtButton } from "@/components/debts/debt-ui";

export const metadata: Metadata = { title: "Debt & Loans" };

export default async function DebtsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const ws = await requireWorkspace();
  const sp = await searchParams;
  const debts = await getDebts();
  const m = (v: number) => formatMoney(v, ws.settings.currency, { locale: ws.settings.locale });
  const list = debts.map((d) => ({ ...d, nextDue: d.next_due_date ? rollForwardDueDate(d.next_due_date, d.payment_frequency, ws.today) : null }));
  const outstanding = list.reduce((s, d) => s + d.outstandingMinor, 0);
  const emi = list.filter((d) => d.outstandingMinor > 0).reduce((s, d) => s + (d.payment_frequency === "monthly" ? d.emi_minor ?? 0 : 0), 0);
  const projections = list.filter((d) => d.outstandingMinor > 0).map((d) => (d.emi_minor ? amortize({ balanceMinor: d.outstandingMinor, annualRatePct: d.interest_rate, paymentMinor: d.emi_minor, frequency: d.payment_frequency, startDate: d.nextDue ?? ws.today }) : null));
  const debtFree = projections.every((p) => p && !p.neverPaysOff) ? projections.map((p) => p!.payoffDate).filter(Boolean).sort().at(-1) : null;
  const upcoming = list.filter((d) => d.outstandingMinor > 0 && d.nextDue).sort((a, b) => a.nextDue!.localeCompare(b.nextDue!))[0];

  return (
    <>
      <PageHeader title="Debt & Loans" description="Track EMIs, repayments and your path to being debt-free." actions={<NewDebtButton defaultOpen={sp.new === "1"} />} />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total outstanding" value={m(outstanding)} icon={CreditCard} highlight />
        <StatCard label="Monthly EMIs" value={m(emi)} icon={Wallet} />
        <StatCard label="Interest paid so far" value={m(list.reduce((s, d) => s + d.interestPaidMinor, 0))} icon={Percent} />
        <StatCard label="Debt-free target (est.)" value={outstanding === 0 && list.length ? "Debt free" : debtFree ? formatDisplayDate(debtFree, "MMM yyyy") : "—"} icon={CalendarCheck} hint={upcoming ? `Next: ${upcoming.name} on ${formatDisplayDate(upcoming.nextDue!)}` : undefined} />
      </section>
      {list.length === 0 ? (
        <EmptyState className="mt-6" icon={CreditCard} title="No debts tracked" description="Add personal, education, vehicle or home loans and credit card balances to plan repayments." action={<NewDebtButton />} />
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((d) => <DebtCard key={d.id} debt={d} />)}
        </div>
      )}
      <EstimateNote className="mt-4">Debt-free dates and interest figures are projections based on your EMI and interest rate. They are estimates, not lender statements.</EstimateNote>
    </>
  );
}
