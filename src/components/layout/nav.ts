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
  /** One plain-language line explaining what the section is for. */
  hint: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Home",
    items: [{ href: "/dashboard", label: "Overview", icon: LayoutDashboard, hint: "Your money at a glance" }],
  },
  {
    label: "Day-to-day money",
    items: [
      { href: "/transactions", label: "Transactions", icon: ArrowLeftRight, hint: "Everything in and out" },
      { href: "/income", label: "Income", icon: Wallet, hint: "Money you receive" },
      { href: "/expenses", label: "Expenses", icon: Receipt, hint: "Money you spend" },
    ],
  },
  {
    label: "Plan ahead",
    items: [
      { href: "/budgets", label: "Budgets", icon: Gauge, hint: "Spending limits per category" },
      { href: "/goals", label: "Financial Goals", icon: Target, hint: "Save for things you want" },
      { href: "/savings", label: "Savings", icon: PiggyBank, hint: "Savings pots & emergency fund" },
    ],
  },
  {
    label: "Grow & owe",
    items: [
      { href: "/investments", label: "Investments", icon: TrendingUp, hint: "Stocks, funds, gold & more" },
      { href: "/debts", label: "Debt & Loans", icon: CreditCard, hint: "Loans, cards & EMIs" },
      { href: "/net-worth", label: "Net Worth", icon: Landmark, hint: "What you own minus what you owe" },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/calculators", label: "Calculators", icon: Calculator, hint: "EMI, SIP, FIRE & more" },
      { href: "/reports", label: "Reports", icon: BarChart3, hint: "Charts & downloads" },
      { href: "/achievements", label: "Achievements", icon: Trophy, hint: "Milestones you've reached" },
      { href: "/settings", label: "Settings", icon: Settings, hint: "Profile, currency, categories" },
    ],
  },
];

export const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

