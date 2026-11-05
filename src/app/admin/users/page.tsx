import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { listUsers } from "@/server/queries/admin";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Pagination } from "@/components/shared/pagination";
import { UserFilters, UserTable } from "@/components/admin/user-table";
import { EmptyState } from "@/components/shared/states";

export const metadata: Metadata = { title: "Users" };

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const ws = await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? "").slice(0, 100);
  const status = ["active", "inactive", "unverified", "suspended"].includes(sp.status ?? "") ? sp.status! : "";
  const { rows, total } = await listUsers(q, status, page);
  const pageCount = Math.max(1, Math.ceil(total / 25));
  const href = (p: number) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), page: String(p) }).toString()}`;
  return (
    <>
      <PageHeader title="Users" description={`${total} accounts`} />
      <UserFilters />
      <Card className="mt-4"><CardContent className="pt-2 sm:pt-2">{rows.length ? <UserTable rows={rows} isSuper={ws.roles.includes("super_admin")} selfId={ws.userId} /> : <EmptyState title="No users match" />}<Pagination page={page} pageCount={pageCount} makeHref={href} /></CardContent></Card>
    </>
  );
}
