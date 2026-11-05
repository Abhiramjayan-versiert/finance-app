import Link from "next/link";
import type { Metadata } from "next";
import { Download, Upload } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { getRecurring, getTransactions } from "@/server/queries/finance";
import { totals } from "@/lib/finance/analytics";
import { formatMoney } from "@/lib/finance/money";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TransactionFilters } from "@/components/transactions/filters";
import { TransactionList } from "@/components/transactions/transaction-list";
import { RecurringList } from "@/components/transactions/recurring-list";
import { Pagination, paginate } from "@/components/shared/pagination";
import { AddTransactionButtons } from "@/components/transactions/add-buttons";
import { cn } from "@/lib/utils";
import { filtersFrom, type TxSearchParams as SP } from "@/lib/filters";

export const metadata: Metadata = { title: "Transactions" };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ws = await requireWorkspace();
  const sp = await searchParams;
  const view = sp.view === "recurring" ? "recurring" : "all";
  const f = filtersFrom(sp);
  const [txs, recurring] = await Promise.all([view === "all" ? getTransactions(f) : Promise.resolve([]), getRecurring()]);
  const t = totals(txs);
  const pg = paginate(txs, Number(sp.page) || 1);
  const m = (v: number) => formatMoney(v, ws.settings.currency, { locale: ws.settings.locale });
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    Object.entries(extra).forEach(([k, v]) => p.set(k, v));
    return `?${p.toString()}`;
  };
  const exportQs = new URLSearchParams({ report: "transactions", ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}), ...(f.type ? { type: f.type } : {}), ...(f.categoryId ? { category: f.categoryId } : {}) }).toString();

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Every income and expense entry, searchable and filterable."
        actions={
          <>
            <Button variant="secondary" size="sm" asChild><Link href="/transactions/import"><Upload /> Import</Link></Button>
            <Button variant="secondary" size="sm" asChild><a href={`/api/export?${exportQs}&format=csv`}><Download /> CSV</a></Button>
            <AddTransactionButtons />
          </>
        }
      />
      <div className="mb-4 flex gap-1 border-b border-border">
        {[{ k: "all", l: "All transactions" }, { k: "recurring", l: `Recurring (${recurring.length})` }].map((tab) => (
          <Link key={tab.k} href={tab.k === "all" ? "/transactions" : "/transactions?view=recurring"} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", view === tab.k ? "border-accent font-medium" : "border-transparent text-muted hover:text-foreground")}>{tab.l}</Link>
        ))}
      </div>
      {view === "recurring" ? (
        <Card><CardContent className="pt-2 sm:pt-2"><RecurringList rules={recurring} /></CardContent></Card>
      ) : (
        <>
          <TransactionFilters />
          <div className="my-4 grid grid-cols-3 gap-3 text-sm">
            <Card className="p-3"><p className="text-xs text-muted">Income</p><p className="font-semibold text-success tabular">{m(t.incomeMinor)}</p></Card>
            <Card className="p-3"><p className="text-xs text-muted">Expenses</p><p className="font-semibold tabular">{m(t.expenseMinor)}</p></Card>
            <Card className="p-3"><p className="text-xs text-muted">Net · {txs.length} entries</p><p className={cn("font-semibold tabular", t.netMinor < 0 && "text-danger")}>{m(t.netMinor)}</p></Card>
          </div>
          <Card>
            <CardContent className="pt-2 sm:pt-2">
              <TransactionList transactions={pg.items} emptyTitle="No matching transactions" emptyDescription="Try changing the filters, or add a new entry." />
              <Pagination page={pg.page} pageCount={pg.pageCount} makeHref={(p) => `/transactions${qs({ page: String(p) })}`} />
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
