import type { Metadata } from "next";
import { CalculatorSuite } from "@/components/calculators/calculators";

export const metadata: Metadata = { title: "Free financial calculators", description: "SIP, EMI, compound interest, retirement, inflation, emergency fund and financial independence calculators." };

export default function PublicCalculators() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Financial calculators</h1>
      <p className="mb-6 mt-2 text-sm text-muted">Free to use, no account needed. Create an account to save goals and track progress.</p>
      <CalculatorSuite />
    </div>
  );
}
