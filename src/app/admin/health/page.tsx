import type { Metadata } from "next";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { adminAuth, getStore } from "@/lib/firebase/admin";
import { isEmailConfigured, serverEnv } from "@/lib/env.server";
import { publicEnv } from "@/lib/env";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata: Metadata = { title: "System health" };

async function timed<T>(fn: () => PromiseLike<T>) {
  const t = performance.now();
  try {
    const r = await fn();
    return { ok: true as const, ms: Math.round(performance.now() - t), r };
  } catch (e) {
    return { ok: false as const, ms: Math.round(performance.now() - t), error: e instanceof Error ? e.message : String(e) };
  }
}

export default async function AdminHealth() {
  const store = getStore();
  const dbCheck = await timed(() => store.get("platform/settings"));
  const authCheck = await timed(() => adminAuth().listUsers(1));
  const errors = await store.list<{ created_at: string; source: string; path: string | null; message: string }>("app_errors", { orderBy: ["created_at", "desc"], limit: 50 });
  const checks: Array<{ name: string; status: "ok" | "warn" | "fail"; detail: string }> = [
    { name: "Database (Firestore)", status: dbCheck.ok ? "ok" : "fail", detail: dbCheck.ok ? `Responded in ${dbCheck.ms} ms` : dbCheck.error },
    { name: "Authentication (Firebase Auth)", status: authCheck.ok ? "ok" : "fail", detail: authCheck.ok ? `Responded in ${authCheck.ms} ms` : authCheck.error },
    { name: "Site URL", status: publicEnv.siteUrl.startsWith("https://") ? "ok" : "warn", detail: publicEnv.siteUrl },
    { name: "Email (Resend)", status: isEmailConfigured() ? "ok" : "warn", detail: isEmailConfigured() ? "Configured — 6-digit codes & email notifications" : "Not set — Firebase verification/reset links are used; notification emails off" },
    { name: "Cron secret", status: serverEnv.cronSecret ? "ok" : "warn", detail: serverEnv.cronSecret ? "Configured" : "CRON_SECRET not set — scheduled jobs are disabled" },
  ];
  const Icon = { ok: CheckCircle2, warn: AlertTriangle, fail: XCircle };
  const color = { ok: "text-success", warn: "text-warning", fail: "text-danger" };
  return (
    <>
      <PageHeader title="System health" description="Live checks run when this page loads." />
      <Card>
        <CardContent className="pt-4 sm:pt-4">
          <ul className="divide-y divide-border">
            {checks.map((c) => {
              const I = Icon[c.status];
              return <li key={c.name} className="flex items-start gap-3 py-3 text-sm"><I className={`mt-0.5 size-4 ${color[c.status]}`} /><span className="flex-1 font-medium">{c.name}</span><span className="text-right text-xs text-muted">{c.detail}</span></li>;
            })}
          </ul>
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader><div><CardTitle>Recent application errors</CardTitle><CardDescription>Messages only — no financial data is logged</CardDescription></div></CardHeader>
        <CardContent>
          {errors?.length ? (
            <Table>
              <THead><tr><TH>When</TH><TH>Source</TH><TH>Path</TH><TH>Message</TH></tr></THead>
              <tbody>{errors.map((e) => <TR key={e.id}><TD className="whitespace-nowrap text-xs">{new Date(e.created_at).toLocaleString()}</TD><TD className="text-xs">{e.source}</TD><TD className="text-xs">{e.path}</TD><TD className="max-w-md truncate text-xs" title={e.message}>{e.message}</TD></TR>)}</tbody>
            </Table>
          ) : <p className="py-6 text-center text-xs text-muted">No errors recorded. 🎉</p>}
        </CardContent>
      </Card>
    </>
  );
}
