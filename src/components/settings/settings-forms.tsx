"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Pencil, Plus, Upload } from "lucide-react";
import { ActionForm, CheckboxField, FormRow, MoneyField, SelectField, SubmitButton, TextField, type FormAction } from "@/components/forms/action-form";
import { useWorkspace } from "@/components/providers/workspace";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CURRENCIES, fromMinor } from "@/lib/finance/money";
import { PAYMENT_METHODS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import { deleteAccountAction, updateNotificationPrefsAction, updatePreferencesAction, updateProfileAction } from "@/server/actions/settings";
import { changePasswordAction } from "@/server/actions/auth";
import { archiveCategoryAction, saveCategoryAction } from "@/server/actions/transactions";
import type { Category, NotificationPrefs, UserSettings } from "@/types/database";

const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Kathmandu", "Asia/Colombo", "Asia/Tokyo", "Europe/London", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Los_Angeles", "America/Toronto", "Australia/Sydney", "UTC"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function ProfileForm({ fullName, country, email, avatarUrl }: { fullName: string; country: string; email: string; avatarUrl: string | null }) {
  const ws = useWorkspace();
  const [avatarPath, setAvatarPath] = useState<string>("");
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  async function upload(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) return toast.error("Use a JPG, PNG or WEBP image up to 2 MB.");
    const path = `${ws.userId}/avatar-${Date.now()}.${file.type.split("/")[1]}`;
    const { error } = await createClient().storage.from("avatars").upload(path, file, { contentType: file.type, upsert: true });
    if (error) return toast.error("Upload failed");
    setAvatarPath(path);
    setPreview(URL.createObjectURL(file));
    toast.success("Photo uploaded — save to apply");
  }
  return (
    <ActionForm action={updateProfileAction as unknown as FormAction}>
      <input type="hidden" name="avatarPath" value={avatarPath} />
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview ? <img src={preview} alt="Profile photo" className="size-16 rounded-full object-cover" /> : <div className="flex size-16 items-center justify-center rounded-full bg-card-2 text-lg font-semibold">{(fullName || email)[0]?.toUpperCase()}</div>}
        <Button type="button" variant="secondary" size="sm" asChild><label className="cursor-pointer"><Upload /> Change photo<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label></Button>
      </div>
      <FormRow>
        <TextField label="Full name" name="fullName" defaultValue={fullName} required />
        <TextField label="Country (ISO code)" name="country" defaultValue={country} maxLength={2} hint="e.g. IN, US, GB" />
      </FormRow>
      <TextField label="Email" name="emailDisplay" value={email} readOnly disabled hint="Email changes are handled by support for security." />
      <div className="flex justify-end"><SubmitButton>Save profile</SubmitButton></div>
    </ActionForm>
  );
}

export function PreferencesForm({ s }: { s: UserSettings }) {
  const { setTheme } = useTheme();
  const router = useRouter();
  const [currency, setCurrency] = useState(s.currency);
  return (
    <ActionForm action={updatePreferencesAction as unknown as FormAction} onSuccess={() => router.refresh()}>
      <FormRow>
        <SelectField label="Currency" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} hint="Changing currency relabels amounts; it does not convert them.">
          {Object.values(CURRENCIES).map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name} ({c.symbol})</option>)}
        </SelectField>
        <SelectField label="Number format (locale)" name="locale" defaultValue={s.locale}>
          {["en-IN", "en-US", "en-GB", "en-AE", "en-SG", "en-AU", "en-CA", "de-DE", "fr-FR", "ja-JP"].map((l) => <option key={l} value={l}>{l}</option>)}
        </SelectField>
      </FormRow>
      <FormRow>
        <SelectField label="Time zone" name="timezone" defaultValue={s.timezone}>
          {[...new Set([s.timezone, ...TIMEZONES])].map((t) => <option key={t} value={t}>{t}</option>)}
        </SelectField>
        <SelectField label="Date format" name="dateFormat" defaultValue={s.date_format}>
          {["dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd", "dd MMM yyyy"].map((f) => <option key={f} value={f}>{f}</option>)}
        </SelectField>
      </FormRow>
      <FormRow>
        <SelectField label="Financial year starts" name="fyStartMonth" defaultValue={s.fy_start_month}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </SelectField>
        <SelectField label="Theme" name="theme" defaultValue={s.theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="system">System</option>
        </SelectField>
      </FormRow>
      <FormRow>
        <SelectField label="Default payment method" name="defaultPaymentMethod" defaultValue={s.default_payment_method}>
          {PAYMENT_METHODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </SelectField>
        <MoneyField label="Opening cash balance" name="openingBalance" currencySymbol={CURRENCIES[currency]?.symbol ?? ""} defaultValue={fromMinor(s.opening_balance_minor, s.currency)} hint="Cash & bank money you had when you started tracking." />
      </FormRow>
      <SelectField label="Net worth: cash & bank source" name="netWorthCashSource" defaultValue={s.net_worth_cash_source} hint="Use one source so cash is never counted twice.">
        <option value="tracked">Tracked cash (opening balance + income − expenses − transfers)</option>
        <option value="manual">Manual bank / cash balances on the Net Worth page</option>
      </SelectField>
      <div className="flex justify-end"><SubmitButton>Save preferences</SubmitButton></div>
    </ActionForm>
  );
}

export function NotificationPrefsForm({ prefs, emailConfigured }: { prefs: NotificationPrefs; emailConfigured: boolean }) {
  const items: Array<[keyof NotificationPrefs, string, string]> = [
    ["budget_warnings", "Budget warnings", "When spending crosses your thresholds"],
    ["goal_deadlines", "Goal deadlines", "30 and 7 days before a target date"],
    ["emi_reminders", "EMI reminders", "3 days before a due date"],
    ["recurring_reminders", "Recurring transactions", "2 days before a scheduled entry"],
    ["monthly_summary", "Monthly summary", "At the start of each month"],
    ["milestones", "Milestones & achievements", "Savings milestones, completed goals, badges"],
  ];
  return (
    <ActionForm action={updateNotificationPrefsAction as unknown as FormAction}>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map(([k, l, d]) => <CheckboxField key={k} name={k} label={l} description={d} defaultChecked={prefs[k]} />)}
      </div>
      <CheckboxField name="email" label="Also send by email" description={emailConfigured ? "Delivered by the daily job. Only sent if delivery succeeds." : "Email delivery is not configured on this server yet — in-app notifications still work."} defaultChecked={prefs.email} />
      <div className="flex justify-end"><SubmitButton>Save notification settings</SubmitButton></div>
    </ActionForm>
  );
}

function CategoryForm({ kind, initial, parents, onDone }: { kind: "income" | "expense"; initial?: Category; parents: Category[]; onDone: () => void }) {
  return (
    <ActionForm action={saveCategoryAction as unknown as FormAction} onSuccess={onDone}>
      <input type="hidden" name="kind" value={kind} />
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <TextField label="Name" name="name" defaultValue={initial?.name} required maxLength={60} />
      {kind === "expense" ? (
        <SelectField label="Parent category" name="parentId" defaultValue={initial?.parent_id ?? ""} hint="Choose a parent to make this a subcategory.">
          <option value="">None (top-level)</option>
          {parents.filter((p) => p.id !== initial?.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </SelectField>
      ) : null}
      <div className="space-y-1.5"><label htmlFor="color" className="text-sm font-medium">Colour</label><input id="color" name="color" type="color" defaultValue={initial?.color ?? "#A0A6AD"} className="h-10 w-20 cursor-pointer rounded-md border border-border bg-background-2" /></div>
      <div className="flex justify-end"><SubmitButton>Save category</SubmitButton></div>
    </ActionForm>
  );
}

export function CategoryManager() {
  const ws = useWorkspace();
  const { run } = useAction();
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const list = kind === "expense" ? ws.expenseCategories : ws.incomeCategories;
  const parents = ws.expenseCategories.filter((c) => !c.parent_id && !c.archived);
  const ordered = kind === "expense" ? parents.flatMap((p) => [p, ...ws.expenseCategories.filter((c) => c.parent_id === p.id)]).concat(ws.expenseCategories.filter((c) => !c.parent_id && c.archived)) : list;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="inline-flex rounded-md border border-border p-1">
          {(["expense", "income"] as const).map((k) => <button key={k} onClick={() => setKind(k)} className={`rounded-sm px-3 py-1 text-xs capitalize ${kind === k ? "bg-card-2 font-medium" : "text-muted"}`}>{k}</button>)}
        </div>
        <Button size="sm" onClick={() => setEditing("new")}><Plus /> Add category</Button>
      </div>
      <ul className="divide-y divide-border">
        {ordered.map((c) => (
          <li key={c.id} className={`flex items-center gap-3 py-2 text-sm ${c.parent_id ? "pl-6" : ""}`}>
            <span className="size-3 rounded-full" style={{ background: c.color }} />
            <span className={`flex-1 ${c.archived ? "text-muted line-through" : ""}`}>{c.name}</span>
            {c.is_default ? <Badge>Default</Badge> : null}
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}><Pencil /></Button>
            <Button variant="ghost" size="icon-sm" aria-label={c.archived ? "Restore" : "Archive"} onClick={() => run(() => archiveCategoryAction(kind, c.id, !c.archived))}>{c.archived ? <ArchiveRestore /> : <Archive />}</Button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">Archived categories are hidden from new entries but kept on past transactions.</p>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing ? <DialogContent title={editing === "new" ? `New ${kind} category` : "Edit category"}><CategoryForm kind={kind} initial={editing === "new" ? undefined : editing} parents={parents} onDone={() => setEditing(null)} /></DialogContent> : null}
      </Dialog>
    </div>
  );
}

export function SecurityForms() {
  return (
    <ActionForm action={changePasswordAction as unknown as FormAction} resetOnSuccess>
      <FormRow>
        <TextField label="New password" name="password" type="password" autoComplete="new-password" hint="8+ characters, upper & lowercase and a number" />
        <TextField label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" />
      </FormRow>
      <div className="flex justify-end"><SubmitButton>Change password</SubmitButton></div>
    </ActionForm>
  );
}

export function DeleteAccountForm() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>Delete my account</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Delete your account permanently?" description="All financial records, files and settings are erased. This cannot be undone. Export your data first if you need it.">
          <ActionForm action={deleteAccountAction as unknown as FormAction}>
            <TextField label="Type DELETE to confirm" name="confirm" autoComplete="off" />
            <TextField label="Current password" name="password" type="password" autoComplete="current-password" />
            <div className="flex justify-end"><SubmitButton variant="danger" pendingLabel="Deleting…">Delete everything</SubmitButton></div>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}
