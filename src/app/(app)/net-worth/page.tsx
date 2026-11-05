import type { Metadata } from "next";
import { Landmark, Scale, TrendingDown, TrendingUp } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getNetWorth, getSnapshots } from "@/server/queries/finance";
import { upsertSnapshot } from "@/server/maintenance";
import { changePct } from "@/lib/finance/analytics";
import { formatMoney } from "@/lib/finance/money";
import { monthLabel } from "@/lib/finance/dates";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarList, LineTrend } from "@/components/charts/charts";
import { ManualItems, NetWorthToolbar } from "@/components/networth/networth-ui";

export const metadata: Metadata = { title: "Net Worth" };

export default async function NetWorthPage() {
  const ws = await requireWorkspace();
  const supabase = await createClient();
  const nw = await getNetWorth(ws.today, ws.settings.net_worth_cash_source);
  // Keep this month's snapshot current so history reflects reality.
  await upsertSnapshot(supabase, ws.userId, ws.today, nw);
  const snaps = await getSnapshots(supabase, 24);
  const m = (v: number) => formatMoney(v, ws.settings.currency, { locale: ws.settings.locale });
  const thisMonth = `${ws.today.slice(0, 7)}-01`;
  const prev = [...snaps].reverse().find((s) => s.snapshot_month < thisMonth);
  const growth = prev ? nw.netWorthMinor - prev.net_worth_minor : null;

  return (
    <>
      <PageHeader title="Net Worth" description="Net worth = total assets − total liabilities. Each pool of money is counted exactly once." actions={<NetWorthToolbar />} />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Current net worth" value={m(nw.netWorthMinor)} icon={Landmark} highlight />
        <StatCard label="Previous month" value={prev ? m(prev.net_worth_minor) : "—"} icon={Scale} hint={prev ? monthLabel(prev.snapshot_month.slice(0, 7)) : "No snapshot yet"} />
        <StatCard label="Growth" value={growth !== null ? `${growth >= 0 ? "+" : "−"}${m(Math.abs(growth))}` : "—"} icon={growth !== null && growth < 0 ? TrendingDown : TrendingUp} change={prev ? changePct(nw.netWorthMinor, prev.net_worth_minor) : null} />
        <StatCard label="Assets / liabilities" value={m(nw.totalAssetsMinor)} icon={TrendingUp} hint={`− ${m(nw.totalLiabilitiesMinor)} owed`} />
      </section>
      <Card className="mt-4">
        <CardHeader><div><CardTitle>Net worth history</CardTitle><CardDescription>Monthly snapshots (this month updates automatically)</CardDescription></div></CardHeader>
        <CardContent>{snaps.length > 1 ? <LineTrend data={snaps.map((s) => ({ label: monthLabel(s.snapshot_month.slice(0, 7)), valueMinor: s.net_worth_minor }))} name="Net worth" /> : <p className="py-10 text-center text-xs text-muted">History builds up month by month. Come back next month to see your trend.</p>}</CardContent>
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><div><CardTitle>Asset allocation</CardTitle><CardDescription>{m(nw.totalAssetsMinor)}</CardDescription></div></CardHeader>
          <CardContent><BarList items={nw.assets.map((a) => ({ key: a.name, label: a.name, valueMinor: a.valueMinor }))} emptyLabel="No assets yet" /></CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Liability breakdown</CardTitle><CardDescription>{m(nw.totalLiabilitiesMinor)}</CardDescription></div></CardHeader>
          <CardContent><BarList items={nw.liabilities.map((a) => ({ key: a.name, label: a.name, valueMinor: a.valueMinor, tone: "danger" as const }))} emptyLabel="No liabilities — nice!" /></CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Manual assets & liabilities</CardTitle><CardDescription>Update values whenever they change</CardDescription></div></CardHeader>
          <CardContent><ManualItems assets={nw.manual.assets} liabilities={nw.manual.liabilities} cashSource={ws.settings.net_worth_cash_source} /></CardContent>
        </Card>
      </div>
      <p className="mt-4 text-xs text-muted">
        {ws.settings.net_worth_cash_source === "tracked"
          ? "Cash is calculated from your opening balance + income − expenses − money moved into savings, goals, investments and debt payments. Manual cash/bank entries are excluded to avoid double counting."
          : "Cash comes from your manual cash and bank balance entries; the tracked cash balance is not used."}
      </p>
    </>
  );
}
