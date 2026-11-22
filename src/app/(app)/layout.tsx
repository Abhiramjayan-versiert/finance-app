import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { currencyInfo } from "@/lib/finance/money";
import { WorkspaceProvider } from "@/components/providers/workspace";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { WebAppLock } from "@/components/auth/app-lock";
import { LOCK_COOKIE, UNLOCKED_COOKIE } from "@/lib/app-lock";
import { cookies } from "next/headers";
import { getCategories, getUnreadCount } from "@/server/queries/finance";
import { syncWorkspace } from "@/server/sync";
import { getPublicSettings } from "@/server/queries/platform";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ws = await requireWorkspace();
  const platform = await getPublicSettings();
  if (platform.maintenance_mode && !ws.isAdmin) redirect("/maintenance");

  await syncWorkspace(ws);
  const jar = await cookies();
  const lockOn = jar.get(LOCK_COOKIE)?.value === "1";
  const unlocked = jar.get(UNLOCKED_COOKIE)?.value === "1";
  const [cats, unread] = await Promise.all([getCategories(), getUnreadCount().catch(() => 0)]);

  return (
    <WorkspaceProvider
      value={{
        userId: ws.userId,
        currency: ws.settings.currency,
        currencySymbol: currencyInfo(ws.settings.currency).symbol,
        locale: ws.settings.locale,
        today: ws.today,
        dateFormat: ws.settings.date_format,
        defaultPaymentMethod: ws.settings.default_payment_method,
        incomeCategories: cats.income,
        expenseCategories: cats.expense,
      }}
    >
      <div className="flex min-h-dvh">
        <Sidebar isAdmin={ws.isAdmin} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar name={ws.profile.full_name} email={ws.email} unread={unread} isAdmin={ws.isAdmin} announcement={platform.announcement || undefined} />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-[calc(100px+env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pt-4 lg:pb-10">{children}</main>
        </div>
      </div>
      <BottomNav isAdmin={ws.isAdmin} />
      <WebAppLock enabled={lockOn} initiallyLocked={lockOn && !unlocked} />
    </WorkspaceProvider>
  );
}
