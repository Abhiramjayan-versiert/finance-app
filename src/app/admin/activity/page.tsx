import type { Metadata } from "next";
import { getAdminStats, getRegistrationSeries, listUsers } from "@/server/queries/admin";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CountChart } from "@/components/admin/count-chart";
import { formatDisplayDate } from "@/lib/finance/dates";
import { Activity, CalendarDays, CalendarRange } from "lucide-react";

export const metadata: Metadata = { title: "User activity" };

export default async function AdminActivity() {
  const [s, series, recent] = await Promise.all([getAdminStats(), getRegistrationSeries(60), listUsers("", "", 1, 25)]);
  const sorted = [...recent.rows].sort((a, b) => (b.last_seen_at ?? "").localeCompare(a.last_seen_at ?? "")).slice(0, 15);
  return (
    <>
      <PageHeader title="User activity" description="Active users are counted once per day they open the app." />
      <section className="grid grid-cols-3 gap-3">
        <StatCard label="Daily active" value={String(s.dau)} icon={Activity} />
        <StatCard label="Weekly active" value={String(s.wau)} icon={CalendarDays} />
        <StatCard label="Monthly active" value={String(s.mau)} icon={CalendarRange} />
      </section>
      <Card className="mt-4">
        <CardHeader><div><CardTitle>Daily active users</CardTitle><CardDescription>Last 60 days</CardDescription></div></CardHeader>
        <CardContent><CountChart data={series.map((d) => ({ label: formatDisplayDate(d.day, "dd MMM"), value: Number(d.active_users) }))} name="Active users" /></CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader><div><CardTitle>Recently active</CardTitle><CardDescription>Among the 25 newest accounts</CardDescription></div></CardHeader>
        <CardContent>
          <ul className="divide-y divide-border text-sm">
            {sorted.map((u) => <li key={u.id} className="flex justify-between gap-3 py-2"><span className="truncate">{u.email}</span><span className="shrink-0 text-xs text-muted">{u.last_seen_at ? new Date(u.last_seen_at).toLocaleString() : "Never"}</span></li>)}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
