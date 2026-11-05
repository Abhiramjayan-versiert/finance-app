import type { Metadata } from "next";
import { getStore } from "@/lib/firebase/admin";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/states";

export const metadata: Metadata = { title: "Audit logs" };

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const size = 50;
  const store = getStore();
  const [all, count] = await Promise.all([store.list<{ created_at: string; actor_email: string | null; action: string; target_type: string | null; target_id: string | null; metadata: Record<string, unknown>; ip_address: string | null }>("audit_logs", { orderBy: ["created_at", "desc"], limit: page * size }), store.count("audit_logs")]);
  const data = all.slice((page - 1) * size);
  return (
    <>
      <PageHeader title="Audit logs" description="Append-only record of privileged actions." />
      <Card>
        <CardContent className="pt-2 sm:pt-2">
          {data?.length ? (
            <Table>
              <THead><tr><TH>When</TH><TH>Actor</TH><TH>Action</TH><TH>Target</TH><TH className="hidden lg:table-cell">Details</TH><TH className="hidden md:table-cell">IP</TH></tr></THead>
              <tbody>
                {data.map((a) => (
                  <TR key={a.id}>
                    <TD className="whitespace-nowrap text-xs">{new Date(a.created_at).toLocaleString()}</TD>
                    <TD className="text-xs">{a.actor_email ?? "system"}</TD>
                    <TD className="text-xs font-medium">{a.action}</TD>
                    <TD className="text-xs">{a.target_type ? `${a.target_type}:${String(a.target_id).slice(0, 8)}` : "—"}</TD>
                    <TD className="hidden max-w-xs truncate text-xs text-muted lg:table-cell">{Object.keys(a.metadata ?? {}).length ? JSON.stringify(a.metadata) : ""}</TD>
                    <TD className="hidden text-xs text-muted md:table-cell">{a.ip_address}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          ) : <EmptyState title="No audit events yet" />}
          <Pagination page={page} pageCount={Math.max(1, Math.ceil((count ?? 0) / size))} makeHref={(p) => `/admin/audit?page=${p}`} />
        </CardContent>
      </Card>
    </>
  );
}
