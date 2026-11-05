import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { CalculatorSuite } from "@/components/calculators/calculators";

export const metadata: Metadata = { title: "Calculators" };

export default async function CalculatorsPage() {
  const ws = await requireWorkspace();
  return (
    <>
      <PageHeader title="Financial calculators" description="Twelve planning calculators, formatted in your currency." />
      <CalculatorSuite currency={ws.settings.currency} locale={ws.settings.locale} />
    </>
  );
}
