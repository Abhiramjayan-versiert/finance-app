import type { Metadata } from "next";
import { AlertTriangle, BadgeCheck, UserCheck, UserPlus, Users, UserX } from "lucide-react";
import { getAdminStats, getRegistrationSeries } from "@/server/queries/admin";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CountChart } from "@/components/admin/count-chart";
import { formatDisplayDate } from "@/lib/finance/dates";

export const metadata: Metadata = { title: "Overview" };

export default async function AdminOverview() {
  const [s, series] = await Promise.all([getAdminStats(), getRegistrationSeries(30)]);
  return (
    <>
      <PageHeader title="Platform overview" description="Live metrics from the database." />
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Registered users" value={String(s.total_users)} icon={Users} highlight />
        <StatCard label="Verified users" value={String(s.verified_users)} icon={BadgeCheck} hint={s.total_users ? `${Math.round((s.verified_users / s.total_users) * 100)}% verified` : undefined} />
        <StatCard label="New this week" value={String(s.new_users_7d)} icon={UserPlus} hint={`${s.new_users_30d} in 30 days`} />
        <StatCard label="Monthly active" value={String(s.mau)} icon={UserCheck} hint={`DAU ${s.dau} · WAU ${s.wau}`} />
        <StatCard label="Suspended" value={String(s.suspended_users)} icon={UserX} />
        <StatCard label="Errors (24h)" value={String(s.errors_24h)} icon={AlertTriangle} hint={`${s.errors_7d} in 7 days`} />
      </section>
      <Card className="mt-4">
        <CardHeader><div><CardTitle>Registration growth</CardTitle><CardDescription>New accounts per day, last 30 days</CardDescription></div></CardHeader>
        <CardContent><CountChart data={series.map((d) => ({ label: formatDisplayDate(d.day, "dd MMM"), value: Number(d.registrations) }))} name="Registrations" /></CardContent>
      </Card>
    </>
  );
}
