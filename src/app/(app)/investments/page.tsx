import Link from "next/link";
import type { Metadata } from "next";
import { Coins, LineChart, Percent, TrendingUp } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { getInvestments } from "@/server/queries/finance";
import { ASSET_CLASS_LABEL, portfolioTotals, sipFutureValue } from "@/lib/finance/investments";
import { formatMoney, percent } from "@/lib/finance/money";
import { formatDisplayDate, fractionalMonthsBetween, lastMonths, monthLabel } from "@/lib/finance/dates";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState, EstimateNote } from "@/components/shared/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { BarList, LineTrend } from "@/components/charts/charts";
import { InvestmentRowActions, NewInvestmentButton } from "@/components/investments/investment-ui";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Investments" };

export default async function InvestmentsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const ws = await requireWorkspace();
  const sp = await searchParams;
  const inv = await getInvestments();
  const m = (v: number) => formatMoney(v, ws.settings.currency, { locale: ws.settings.locale });
  const p = portfolioTotals(inv.map((i) => ({ asset_type: i.asset_type, investedMinor: i.investedMinor, currentValueMinor: i.current_value_minor })));
  const sips = inv.filter((i) => i.sip_monthly_minor);
  // Actual money invested over time (net contributions), from recorded transactions.
  const allTx = inv.flatMap((i) => i.txs);
  const growth = lastMonths(12, ws.today).map((k) => ({ label: monthLabel(k), valueMinor: allTx.filter((t) => t.occurred_on <= `${k}-31` && t.type !== "valuation").reduce((s, t) => s + (t.type === "buy" ? t.amount_minor : -t.amount_minor), 0) }));

  return (
    <>
      <PageHeader title="Investments" description="Manually tracked portfolio. Values are what you enter — FINANCE OS does not fetch market prices." actions={<NewInvestmentButton defaultOpen={sp.new === "1"} />} />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total invested" value={m(p.investedMinor)} icon={Coins} hint="Remaining cost basis" />
        <StatCard label="Current value" value={m(p.currentValueMinor)} icon={TrendingUp} highlight />
        <StatCard label="Unrealised P/L" value={m(p.unrealizedPnlMinor)} icon={LineChart} hint="Current value − invested" />
        <StatCard label="Return" value={p.investedMinor ? `${p.returnPct}%` : "—"} icon={Percent} hint="Absolute, unrealised" />
      </section>
      {inv.length === 0 ? (
        <EmptyState className="mt-6" icon={TrendingUp} title="No investments yet" description="Add stocks, mutual funds, SIPs, ETFs, FDs, RDs, gold, bonds or digital assets." action={<NewInvestmentButton />} />
      ) : (
        <>
          <Card className="mt-4">
            <CardHeader><div><CardTitle>Holdings</CardTitle><CardDescription>Update values when you check your statements</CardDescription></div></CardHeader>
            <CardContent>
              <Table>
                <THead><tr><TH>Investment</TH><TH className="text-right">Invested</TH><TH className="text-right">Current</TH><TH className="text-right">P/L</TH><TH className="hidden md:table-cell">Updated</TH><TH /></tr></THead>
                <tbody>
                  {inv.map((i) => (
                    <TR key={i.id}>
                      <TD><span className="font-medium">{i.name}</span><span className="block text-xs text-muted">{ASSET_CLASS_LABEL[i.asset_type]}{i.units ? ` · ${i.units} units` : ""}{i.symbol ? ` · ${i.symbol}` : ""}</span></TD>
                      <TD className="text-right tabular">{m(i.investedMinor)}</TD>
                      <TD className="text-right tabular">{m(i.current_value_minor)}</TD>
                      <TD className={cn("text-right tabular", i.pnlMinor > 0 ? "text-success" : i.pnlMinor < 0 ? "text-danger" : "")}>{i.pnlMinor > 0 ? "+" : ""}{m(i.pnlMinor)}<span className="block text-[11px]">{i.investedMinor ? `${percent(i.pnlMinor, i.investedMinor, 1)}%` : ""}</span></TD>
                      <TD className="hidden text-xs text-muted md:table-cell">{i.current_value_as_of ? formatDisplayDate(i.current_value_as_of) : "—"}</TD>
                      <TD><InvestmentRowActions inv={i} txs={i.txs} /></TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </CardContent>
          </Card>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader><div><CardTitle>Asset allocation</CardTitle><CardDescription>By current value</CardDescription></div></CardHeader>
              <CardContent><BarList items={p.allocation.map((a) => ({ key: a.asset_type, label: a.label, valueMinor: a.valueMinor }))} /></CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader><div><CardTitle>Net amount invested</CardTitle><CardDescription>Actual contributions over the last 12 months (not market value)</CardDescription></div></CardHeader>
              <CardContent><LineTrend data={growth} name="Invested" /></CardContent>
            </Card>
          </div>
          {sips.length ? (
            <Card className="mt-4">
              <CardHeader><div><CardTitle>SIP projections</CardTitle><CardDescription>Estimated future value if contributions continue at the expected return</CardDescription></div><Link href="/calculators#sip" className="text-xs text-accent">SIP calculator</Link></CardHeader>
              <CardContent>
                <Table>
                  <THead><tr><TH>SIP</TH><TH className="text-right">Monthly</TH><TH className="text-right">Contributed to date</TH><TH className="text-right">Total over duration</TH><TH className="text-right">Est. future value</TH></tr></THead>
                  <tbody>
                    {sips.map((i) => {
                      const months = i.sip_duration_months ?? 0;
                      const elapsed = i.sip_start_date ? Math.min(months || Infinity, Math.floor(fractionalMonthsBetween(i.sip_start_date, ws.today)) + 1) : 0;
                      const proj = sipFutureValue(i.sip_monthly_minor!, Number(i.expected_return_pct ?? 0), months);
                      return (
                        <TR key={i.id}>
                          <TD className="font-medium">{i.name}<span className="block text-xs text-muted">{i.sip_start_date ? `from ${formatDisplayDate(i.sip_start_date)}` : "Start date not set"} · {months ? `${months} months` : "duration not set"} · {i.expected_return_pct ?? 0}% p.a.</span></TD>
                          <TD className="text-right tabular">{m(i.sip_monthly_minor!)}</TD>
                          <TD className="text-right tabular">{m(i.totalContributedMinor)}<span className="block text-[11px] text-muted">{Number.isFinite(elapsed) ? `${elapsed} instalments due` : ""}</span></TD>
                          <TD className="text-right tabular">{months ? m(proj.investedMinor) : "—"}</TD>
                          <TD className="text-right tabular text-accent">{months ? m(proj.futureValueMinor) : "—"}</TD>
                        </TR>
                      );
                    })}
                  </tbody>
                </Table>
                <EstimateNote className="mt-3">Projections assume a constant return and are estimates, not guaranteed returns. Actual returns are shown in Holdings.</EstimateNote>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </>
  );
}
