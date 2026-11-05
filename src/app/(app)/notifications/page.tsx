import Link from "next/link";
import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generateNotifications } from "@/server/maintenance";
import { PageHeader } from "@/components/shared/page-header";
import { NotificationList } from "@/components/notifications/notification-list";
import { Button } from "@/components/ui/button";
import type { AppNotification } from "@/types/database";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const ws = await requireWorkspace();
  const supabase = await createClient();
  await generateNotifications(supabase, ws.userId, { today: ws.today, currency: ws.settings.currency, locale: ws.settings.locale, prefs: ws.settings.notification_prefs });
  const { data } = await supabase.from("notifications").select("*").eq("user_id", ws.userId).order("created_at", { ascending: false }).limit(200);
  return (
    <>
      <PageHeader title="Notifications" description="Reminders and alerts generated from your budgets, goals, EMIs and recurring transactions." actions={<Button variant="secondary" size="sm" asChild><Link href="/settings#notifications">Preferences</Link></Button>} />
      <NotificationList items={(data ?? []) as AppNotification[]} />
    </>
  );
}
