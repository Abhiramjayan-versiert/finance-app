export interface NetWorthInputs {
  cashSource: "tracked" | "manual";
  trackedCashMinor: number;
  savingsBucketsMinor: number;
  /** Allocations held directly by goals (goals linked to buckets are excluded). */
  goalAllocationsMinor: number;
  investmentsMinor: number;
  manualAssets: Array<{ type: string; value_minor: number }>;
  debtsOutstandingMinor: number;
  manualLiabilities: Array<{ type: string; amount_minor: number }>;
}

export const ASSET_TYPE_LABEL: Record<string, string> = {
  cash: "Cash",
  bank_account: "Bank balances",
  property: "Property",
  vehicle: "Vehicles",
  gold: "Gold",
  other: "Other assets",
};

export const LIABILITY_TYPE_LABEL: Record<string, string> = {
  loans: "Loans",
  credit_card: "Credit cards",
  personal_debt: "Personal debts",
  other: "Other liabilities",
};

/**
 * Net worth = assets − liabilities. Each money pool is counted exactly once:
 * tracked cash excludes money moved into savings, goals and investments, and
 * manual cash/bank assets are only used when the user chose the manual source.
 */
export function computeNetWorth(i: NetWorthInputs) {
  const assets: Record<string, number> = {};
  const add = (k: string, v: number) => {
    if (v !== 0) assets[k] = (assets[k] ?? 0) + v;
  };
  if (i.cashSource === "tracked") add("Cash (tracked)", Math.max(0, i.trackedCashMinor));
  for (const a of i.manualAssets) {
    if (i.cashSource === "tracked" && (a.type === "cash" || a.type === "bank_account")) continue;
    add(ASSET_TYPE_LABEL[a.type] ?? "Other assets", a.value_minor);
  }
  add("Savings", i.savingsBucketsMinor + i.goalAllocationsMinor);
  add("Investments", i.investmentsMinor);

  const liabilities: Record<string, number> = {};
  const addL = (k: string, v: number) => {
    if (v !== 0) liabilities[k] = (liabilities[k] ?? 0) + v;
  };
  addL("Loans", i.debtsOutstandingMinor);
  for (const l of i.manualLiabilities) addL(LIABILITY_TYPE_LABEL[l.type] ?? "Other liabilities", l.amount_minor);
  // A negative tracked cash balance means overspending beyond recorded income.
  if (i.cashSource === "tracked" && i.trackedCashMinor < 0) addL("Cash shortfall", -i.trackedCashMinor);

  const totalAssetsMinor = Object.values(assets).reduce((s, v) => s + v, 0);
  const totalLiabilitiesMinor = Object.values(liabilities).reduce((s, v) => s + v, 0);
  return {
    totalAssetsMinor,
    totalLiabilitiesMinor,
    netWorthMinor: totalAssetsMinor - totalLiabilitiesMinor,
    assets: Object.entries(assets).map(([name, valueMinor]) => ({ name, valueMinor })).sort((a, b) => b.valueMinor - a.valueMinor),
    liabilities: Object.entries(liabilities).map(([name, valueMinor]) => ({ name, valueMinor })).sort((a, b) => b.valueMinor - a.valueMinor),
  };
}
