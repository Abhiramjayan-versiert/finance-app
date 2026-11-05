import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/firebase/admin";
import { getDefaultCategories, getPlatformSettings } from "@/server/data/users";
import { DEFAULT_TEMPLATES } from "@/server/data/defaults";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DefaultCategories, PlatformSettingsForm, TemplateForm } from "@/components/admin/settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettings() {
  const ws = await requireAdmin();
  const store = getStore();
  const [values, custom, cats] = await Promise.all([getPlatformSettings(store), store.list<{ title_template: string; body_template: string; is_active: boolean }>("notification_templates"), getDefaultCategories(store)]);
  const byKey = new Map(custom.map((t) => [t.id, t]));
  const templates = Object.entries(DEFAULT_TEMPLATES).map(([key, d]) => ({ id: key, key, title_template: byKey.get(key)?.title_template ?? d.title, body_template: byKey.get(key)?.body_template ?? d.body, is_active: byKey.get(key)?.is_active ?? true }));
  return (
    <>
      <PageHeader title="Platform settings" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader><div><CardTitle>General</CardTitle><CardDescription>Maintenance mode, registrations and announcements</CardDescription></div></CardHeader><CardContent><PlatformSettingsForm values={values as Record<string, unknown>} canEdit={ws.roles.includes("super_admin")} /></CardContent></Card>
        <Card><CardHeader><div><CardTitle>Default categories</CardTitle></div></CardHeader><CardContent><DefaultCategories items={cats} /></CardContent></Card>
        <Card className="xl:col-span-2"><CardHeader><div><CardTitle>Notification templates</CardTitle></div></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{templates.map((t) => <TemplateForm key={t.id} t={t} />)}</CardContent></Card>
      </div>
    </>
  );
}
