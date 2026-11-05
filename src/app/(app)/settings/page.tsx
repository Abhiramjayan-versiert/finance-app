import type { Metadata } from "next";
import { Download } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { fileUrl } from "@/lib/files/url";
import { isEmailConfigured } from "@/lib/env.server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CategoryManager, DeleteAccountForm, NotificationPrefsForm, PreferencesForm, ProfileForm, SecurityForms } from "@/components/settings/settings-forms";
import { logoutAction } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Settings" };

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-24">
      <CardHeader><div><CardTitle>{title}</CardTitle>{description ? <CardDescription>{description}</CardDescription> : null}</div></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ recovery?: string }> }) {
  const ws = await requireWorkspace();
  const sp = await searchParams;
  const avatar = ws.profile.avatar_url ? fileUrl(ws.profile.avatar_url) : null;
  const links = [["profile", "Profile"], ["preferences", "Preferences"], ["notifications", "Notifications"], ["categories", "Categories"], ["security", "Security"], ["data", "Your data"]];
  return (
    <>
      <PageHeader title="Settings" description="Profile, preferences and account controls." />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Settings sections">
        {links.map(([id, l]) => <a key={id} href={`#${id}`} className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-foreground">{l}</a>)}
      </nav>
      {sp.recovery ? <p className="mb-4 rounded-md border border-accent/40 bg-accent-soft p-3 text-sm text-accent">You signed in with a recovery link. Set a new password below.</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section id="profile" title="Profile"><ProfileForm fullName={ws.profile.full_name} country={ws.profile.country} email={ws.email} avatarUrl={avatar} /></Section>
        <Section id="preferences" title="Preferences" description="Defaults: INR (₹), en-IN, Asia/Kolkata."><PreferencesForm s={ws.settings} /></Section>
        <Section id="notifications" title="Notifications"><NotificationPrefsForm prefs={ws.settings.notification_prefs} emailConfigured={isEmailConfigured()} /></Section>
        <Section id="categories" title="Categories" description="Default and custom categories, with subcategories."><CategoryManager /></Section>
        <Section id="security" title="Security" description="FINANCE OS never stores banking passwords, OTPs or card details.">
          <SecurityForms />
          <form action={logoutAction} className="mt-4 border-t border-border pt-4"><Button variant="secondary" size="sm" type="submit">Sign out of this device</Button></form>
        </Section>
        <Section id="data" title="Your data" description="Export everything or delete your account.">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" asChild><a href="/api/export?report=all&format=json"><Download /> Export all data (JSON)</a></Button>
            <Button variant="secondary" size="sm" asChild><a href="/api/export?report=transactions&from=1900-01-01&to=2200-12-31&format=csv"><Download /> All transactions (CSV)</a></Button>
          </div>
          <div className="mt-6 rounded-md border border-danger/30 p-4">
            <p className="text-sm font-medium text-danger">Danger zone</p>
            <p className="mb-3 mt-1 text-xs text-muted">Permanently delete your account and every financial record.</p>
            <DeleteAccountForm />
          </div>
        </Section>
      </div>
    </>
  );
}
