import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DefaultCategories, PlatformSettingsForm, TemplateForm } from "@/components/admin/settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettings() {
  const ws = await requireAdmin();
  const supabase = await createClient();
  const [{ data: settings }, { data: templates }, { data: cats }] = await Promise.all([
    supabase.from("platform_settings").select("key, value"),
    supabase.from("notification_templates").select("*").order("key"),
    supabase.from("default_categories").select("*").order("kind").order("sort_order"),
  ]);
  const values = Object.fromEntries((settings ?? []).map((s) => [s.key, s.value]));
  return (
    <>
      <PageHeader title="Platform settings" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader><div><CardTitle>General</CardTitle><CardDescription>Maintenance mode, registrations and announcements</CardDescription></div></CardHeader><CardContent><PlatformSettingsForm values={values} canEdit={ws.roles.includes("super_admin")} /></CardContent></Card>
        <Card><CardHeader><div><CardTitle>Default categories</CardTitle></div></CardHeader><CardContent><DefaultCategories items={cats ?? []} /></CardContent></Card>
        <Card className="xl:col-span-2"><CardHeader><div><CardTitle>Notification templates</CardTitle></div></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{(templates ?? []).map((t) => <TemplateForm key={t.id} t={t} />)}</CardContent></Card>
      </div>
    </>
  );
}
