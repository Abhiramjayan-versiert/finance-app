import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/auth";
import { buildReport, REPORT_TYPES, type ReportType } from "@/server/reports";
import { getTransactions } from "@/server/queries/finance";
import { monthlySeries, totals } from "@/lib/finance/analytics";
import { formatMoney } from "@/lib/finance/money";
import { monthLabel, periodRange, previousRange, daysInRange } from "@/lib/finance/dates";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/states";
import { IncomeExpenseChart, TrendChart } from "@/components/charts/charts";
import { ExportButtons, ReportControls } from "@/components/reports/report-controls";
import { changePct } from "@/lib/finance/analytics";

export const metadata: Metadata = { title: "Reports" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ report?: string; from?: string; to?: string; category?: string }> }) {
  const ws = await requireWorkspace();
  const sp = await searchParams;
  const report = (REPORT_TYPES.some((r) => r.value === sp.report) ? sp.report : "monthly-expenses") as ReportType;
  const def = periodRange("year", ws.today);
  const from = DATE.test(sp.from ?? "") ? sp.from! : def.from;
  const to = DATE.test(sp.to ?? "") ? sp.to! : ws.today;
  const range = from <= to ? { from, to } : { from: to, to: from };
  const category = /^[0-9a-f-]{36}$/i.test(sp.category ?? "") ? sp.category! : "";
  const r = await buildReport(ws, report, range, category || undefined);
  const prev = previousRange(range);
  const [cur, before] = await Promise.all([getTransactions({ from: range.from, to: range.to }), getTransactions({ from: prev.from, to: prev.to })]);
  const tc = totals(cur), tp = totals(before);
  const m = (v: number) => formatMoney(v, ws.settings.currency, { locale: ws.settings.locale });
  const query = new URLSearchParams({ report, from: range.from, to: range.to, ...(category ? { category } : {}) }).toString();
  const months = Math.min(24, Math.max(1, Math.ceil(daysInRange(range) / 30.44)));
  const series = monthlySeries(cur, months, range.to);

  return (
    <>
      <PageHeader title="Reports" description="Built from your actual records. Export to CSV, Excel or PDF." actions={<ExportButtons query={query} />} />
      <Card><CardContent className="pt-4 sm:pt-4"><ReportControls types={REPORT_TYPES} report={report} from={range.from} to={range.to} category={category} /></CardContent></Card>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          { l: "Income", c: tc.incomeMinor, p: tp.incomeMinor, good: "up" },
          { l: "Expenses", c: tc.expenseMinor, p: tp.expenseMinor, good: "down" },
          { l: "Net", c: tc.netMinor, p: tp.netMinor, good: "up" },
        ].map((x) => {
          const ch = changePct(x.c, x.p);
          return (
            <Card key={x.l} className="p-4">
              <p className="text-xs text-muted">{x.l} · vs previous {daysInRange(range)} days</p>
              <p className="mt-1 text-lg font-semibold tabular">{m(x.c)}</p>
              <p className="text-xs text-muted tabular">Previous: {m(x.p)}{ch !== null ? <span className={(x.good === "up" ? ch >= 0 : ch <= 0) ? " text-success" : " text-danger"}> · {ch > 0 ? "+" : ""}{ch}%</span> : null}</p>
            </Card>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><div><CardTitle>{r.title}</CardTitle><CardDescription>{r.subtitle}</CardDescription></div></CardHeader>
          <CardContent>
            {r.chart && r.chart.points.length ? <div className="mb-4"><TrendChart data={r.chart.points} name={r.title} /></div> : report === "transactions" ? <div className="mb-4"><IncomeExpenseChart data={series.map((s) => ({ label: monthLabel(s.month), incomeMinor: s.incomeMinor, expenseMinor: s.expenseMinor }))} /></div> : null}
            {r.rows.length ? (
              <Table>
                <THead><tr>{r.columns.map((c) => <TH key={c}>{c}</TH>)}</tr></THead>
                <tbody>
                  {r.rows.slice(0, 500).map((row, i) => (
                    <TR key={i}>{row.map((c, j) => <TD key={j} className={typeof c === "number" ? "text-right tabular" : undefined}>{typeof c === "number" ? c.toLocaleString(ws.settings.locale, { maximumFractionDigits: 2 }) : c}</TD>)}</TR>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState title="No data for this report" description="Try a wider date range or add some records." />
            )}
            {r.rows.length > 500 ? <p className="mt-2 text-xs text-muted">Showing 500 of {r.rows.length} rows — export to see everything.</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Summary</CardTitle></div></CardHeader>
          <CardContent>
            <dl className="divide-y divide-border text-sm">
              {r.summary.map(([k, v]) => <div key={k} className="flex justify-between gap-3 py-2"><dt className="text-muted">{k}</dt><dd className="text-right font-medium tabular">{v}</dd></div>)}
            </dl>
            <p className="mt-4 text-xs text-muted">Need everything? <a className="text-accent" href="/api/export?report=all&format=json">Download all your data (JSON)</a>.</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
