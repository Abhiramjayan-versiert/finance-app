import { formatMoney } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

export function Money({ minor, currency, locale, className, sign, tone }: { minor: number; currency: string; locale?: string; className?: string; sign?: boolean; tone?: "auto" | "income" | "expense" }) {
  const color = tone === "income" ? "text-success" : tone === "expense" ? "text-foreground" : tone === "auto" ? (minor < 0 ? "text-danger" : minor > 0 ? "text-success" : "") : "";
  return <span className={cn("tabular", color, className)}>{formatMoney(minor, currency, { locale, signDisplay: sign ? "exceptZero" : "auto" })}</span>;
}
