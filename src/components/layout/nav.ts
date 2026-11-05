import {
  ArrowLeftRight,
  BarChart3,
  Calculator,
  CreditCard,
  Gauge,
  Landmark,
  LayoutDashboard,
  PiggyBank,
  Settings,
  Target,
  TrendingUp,
  Trophy,
  Wallet,
  Receipt,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/income", label: "Income", icon: Wallet },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/budgets", label: "Budgets", icon: Gauge },
  { href: "/goals", label: "Financial Goals", icon: Target },
  { href: "/savings", label: "Savings", icon: PiggyBank },
  { href: "/investments", label: "Investments", icon: TrendingUp },
  { href: "/debts", label: "Debt & Loans", icon: CreditCard },
  { href: "/net-worth", label: "Net Worth", icon: Landmark },
  { href: "/calculators", label: "Calculators", icon: Calculator },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/achievements", label: "Achievements", icon: Trophy },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const MOBILE_PRIMARY = ["/dashboard", "/transactions", "/goals", "/budgets"];
