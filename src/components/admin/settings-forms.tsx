"use client";

import { ActionForm, CheckboxField, SubmitButton, TextAreaField, TextField, type FormAction } from "@/components/forms/action-form";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/input";
import { addDefaultCategoryAction, toggleDefaultCategoryAction, updatePlatformSettingsAction, updateTemplateAction } from "@/server/actions/admin";

export function PlatformSettingsForm({ values, canEdit }: { values: Record<string, unknown>; canEdit: boolean }) {
  return (
    <ActionForm action={updatePlatformSettingsAction as unknown as FormAction}>
      <CheckboxField name="maintenance_mode" label="Maintenance mode" description="Non-admin users see a maintenance page until this is turned off." defaultChecked={values.maintenance_mode === true} />
      <TextAreaField label="Maintenance message" name="maintenance_message" defaultValue={String(values.maintenance_message ?? "")} rows={2} />
      <CheckboxField name="signups_enabled" label="Allow new registrations" defaultChecked={values.signups_enabled !== false} />
      <TextField label="Announcement banner" name="announcement" defaultValue={String(values.announcement ?? "")} hint="Shown at the top of the app for all users. Leave blank to hide." />
      <div className="flex justify-end"><SubmitButton disabled={!canEdit}>{canEdit ? "Save platform settings" : "Super admin only"}</SubmitButton></div>
    </ActionForm>
  );
}

export function TemplateForm({ t }: { t: { id: string; key: string; title_template: string; body_template: string; is_active: boolean } }) {
  return (
    <ActionForm action={updateTemplateAction as unknown as FormAction} className="rounded-md border border-border p-3">
      <input type="hidden" name="id" value={t.id} />
      <p className="text-xs font-medium text-muted">{t.key}</p>
      <TextField label="Title" name="title_template" defaultValue={t.title_template} />
      <TextAreaField label="Body" name="body_template" defaultValue={t.body_template} rows={2} hint="Variables in {{double braces}} are filled in automatically." />
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={t.is_active} className="accent-[var(--accent)]" /> Active</label>
        <SubmitButton size="sm" className="w-auto shrink-0">Save</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function DefaultCategories({ items }: { items: Array<{ id: string; kind: string; name: string; color: string; is_active: boolean }> }) {
  const { run } = useAction();
  return (
    <div>
      <ActionForm action={addDefaultCategoryAction as unknown as FormAction} resetOnSuccess className="mb-4 flex flex-wrap items-end gap-2 space-y-0">
        <NativeSelect name="kind" className="w-auto" aria-label="Kind"><option value="expense">Expense</option><option value="income">Income</option></NativeSelect>
        <input name="name" placeholder="Category name" aria-label="Category name" className="h-10 min-w-0 flex-1 basis-40 rounded-md border border-border bg-background-2 px-3 text-sm" required maxLength={60} />
        <input name="color" type="color" defaultValue="#A0A6AD" aria-label="Colour" className="h-10 w-12 rounded-md border border-border bg-background-2" />
        <SubmitButton size="sm">Add</SubmitButton>
      </ActionForm>
      <ul className="grid gap-1 sm:grid-cols-2">
        {items.map((c) => (
          <li key={c.id} className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-card-2">
            <span className="size-3 rounded-full" style={{ background: c.color }} />
            <span className={c.is_active ? "min-w-0 flex-1 truncate" : "min-w-0 flex-1 truncate text-muted line-through"}>{c.name}</span>
            <Badge>{c.kind}</Badge>
            <Button variant="ghost" size="sm" onClick={() => run(() => toggleDefaultCategoryAction(c.id, !c.is_active))}>{c.is_active ? "Disable" : "Enable"}</Button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">Defaults are copied into each new user&apos;s workspace at sign-up. Existing users keep their own categories.</p>
    </div>
  );
}
