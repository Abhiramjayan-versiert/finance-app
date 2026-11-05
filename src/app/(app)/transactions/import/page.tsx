import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { StatementImport } from "@/components/import/statement-import";

export const metadata: Metadata = { title: "Import statement" };

export default async function ImportPage() {
  await requireWorkspace();
  return (
    <>
      <Link href="/transactions" className="mb-4 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"><ArrowLeft className="size-3" /> Transactions</Link>
      <PageHeader title="Import bank statement" description="Bring in months of transactions at once from a CSV export." />
      <StatementImport />
    </>
  );
}
