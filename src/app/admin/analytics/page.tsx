import type { Metadata } from "next";
import { getAdminStats, getRegistrationSeries } from "@/server/queries/admin";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CountChart } from "@/components/admin/count-chart";
import { formatDisplayDate } from "@/lib/finance/dates";

export const metadata: Metadata = { title: "Platform analytics" };

export default async function AdminAnalytics() {
  const [s, series] = await Promise.all([getAdminStats(), getRegistrationSeries(365)]);
  // Weekly buckets for readability.
  const weeks: Array<{ label: string; value: number }> = [];
  for (let i = 0; i < series.length; i += 7) {
    const chunk = series.slice(i, i + 7);
    weeks.push({ label: formatDisplayDate(chunk[0].day, "dd MMM"), value: chunk.reduce((a, d) => a + Number(d.registrations), 0) });
  }
  const before = s.total_users - series.reduce((a, d) => a + Number(d.registrations), 0);
  let running = Math.max(0, before);
  const cumulative = weeks.map((w) => ({ label: w.label, value: (running += w.value) }));
  return (
    <>
      <PageHeader title="Platform analytics" description="Growth over the last 12 months." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><div><CardTitle>Registrations per week</CardTitle><CardDescription>Last 52 weeks</CardDescription></div></CardHeader><CardContent><CountChart data={weeks} name="Registrations" /></CardContent></Card>
        <Card><CardHeader><div><CardTitle>Total users</CardTitle><CardDescription>Cumulative, weekly</CardDescription></div></CardHeader><CardContent><CountChart data={cumulative} name="Users" /></CardContent></Card>
      </div>
      <Card className="mt-4">
        <CardContent className="grid gap-4 pt-5 text-sm sm:grid-cols-3 sm:pt-5">
          <div><p className="text-xs text-muted">Verification rate</p><p className="text-lg font-semibold">{s.total_users ? Math.round((s.verified_users / s.total_users) * 100) : 0}%</p></div>
          <div><p className="text-xs text-muted">Stickiness (DAU / MAU)</p><p className="text-lg font-semibold">{s.mau ? Math.round((s.dau / s.mau) * 100) : 0}%</p></div>
          <div><p className="text-xs text-muted">30-day growth</p><p className="text-lg font-semibold">+{s.new_users_30d}</p></div>
        </CardContent>
      </Card>
    </>
  );
}
