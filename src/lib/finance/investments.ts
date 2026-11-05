import Decimal from "decimal.js";
import { percent } from "./money";

export type AssetClass = "stock" | "mutual_fund" | "sip" | "etf" | "fixed_deposit" | "recurring_deposit" | "gold" | "digital_asset" | "bond" | "other";

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  stock: "Stocks",
  mutual_fund: "Mutual funds",
  sip: "SIPs",
  etf: "ETFs",
  fixed_deposit: "Fixed deposits",
  recurring_deposit: "Recurring deposits",
  gold: "Gold",
  digital_asset: "Digital assets",
  bond: "Bonds",
  other: "Other",
};

export interface InvestmentTx {
  type: "buy" | "sell" | "valuation";
  amount_minor: number;
  units: number | string | null;
  occurred_on: string;
}

export interface HoldingSummary {
  investedMinor: number; // remaining cost basis
  totalContributedMinor: number;
  totalWithdrawnMinor: number;
  realizedGainMinor: number;
  units: number;
}

/**
 * Cost basis using the average-cost method. Selling units reduces the cost
 * basis proportionally; when units are not tracked, a sale reduces the basis
 * by the same share of the current position the proceeds represent
 * (capped at the full basis).
 */
export function summarizeHolding(txs: InvestmentTx[], currentValueMinor: number): HoldingSummary {
  const sorted = [...txs].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
  let basis = new Decimal(0);
  let units = new Decimal(0);
  let contributed = 0;
  let withdrawn = 0;
  let realized = new Decimal(0);
  for (const t of sorted) {
    if (t.type === "buy") {
      basis = basis.plus(t.amount_minor);
      contributed += t.amount_minor;
      if (t.units != null) units = units.plus(t.units);
    } else if (t.type === "sell") {
      withdrawn += t.amount_minor;
      let fraction: Decimal;
      if (t.units != null && units.gt(0)) {
        fraction = Decimal.min(1, new Decimal(t.units).div(units));
        units = Decimal.max(0, units.minus(t.units));
      } else {
        const positionValue = Decimal.max(new Decimal(currentValueMinor).plus(t.amount_minor), 1);
        fraction = Decimal.min(1, new Decimal(t.amount_minor).div(positionValue));
      }
      const costOut = basis.mul(fraction).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      realized = realized.plus(new Decimal(t.amount_minor).minus(costOut));
      basis = basis.minus(costOut);
    }
  }
  return {
    investedMinor: basis.toNumber(),
    totalContributedMinor: contributed,
    totalWithdrawnMinor: withdrawn,
    realizedGainMinor: realized.toNumber(),
    units: units.toNumber(),
  };
}

export interface PortfolioItem {
  asset_type: AssetClass;
  investedMinor: number;
  currentValueMinor: number;
}

export function portfolioTotals(items: PortfolioItem[]) {
  const invested = items.reduce((s, i) => s + i.investedMinor, 0);
  const current = items.reduce((s, i) => s + i.currentValueMinor, 0);
  const pnl = current - invested;
  const byClass = new Map<AssetClass, number>();
  for (const i of items) byClass.set(i.asset_type, (byClass.get(i.asset_type) ?? 0) + i.currentValueMinor);
  const allocation = [...byClass.entries()]
    .map(([asset_type, valueMinor]) => ({ asset_type, label: ASSET_CLASS_LABEL[asset_type], valueMinor, pct: percent(valueMinor, current) }))
    .sort((a, b) => b.valueMinor - a.valueMinor);
  return { investedMinor: invested, currentValueMinor: current, unrealizedPnlMinor: pnl, returnPct: percent(pnl, invested), allocation };
}

/**
 * SIP future value (annuity-due, monthly compounding):
 * FV = P × [((1 + i)^n − 1) / i] × (1 + i), i = annual% / 12 / 100.
 */
export function sipFutureValue(monthlyMinor: number, annualReturnPct: number, months: number) {
  const invested = monthlyMinor * Math.max(0, months);
  if (months <= 0 || monthlyMinor <= 0) return { investedMinor: 0, futureValueMinor: 0, gainsMinor: 0 };
  const i = new Decimal(annualReturnPct).div(1200);
  const fv = i.isZero()
    ? new Decimal(invested)
    : new Decimal(monthlyMinor).mul(i.plus(1).pow(months).minus(1).div(i)).mul(i.plus(1));
  const futureValueMinor = fv.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  return { investedMinor: invested, futureValueMinor, gainsMinor: futureValueMinor - invested };
}
