"use client";

import * as React from "react";
import { startTransition, useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ClientActionResult = { ok: true; message?: string; data?: unknown } | { ok: false; error: string; fieldErrors?: Record<string, string> };
export type FormAction = (prev: ClientActionResult | null, fd: FormData) => Promise<ClientActionResult>;

const ErrorsContext = React.createContext<Record<string, string>>({});

/**
 * Progressive-enhancement form bound to a server action. Field errors from the
 * server's Zod validation are surfaced next to each field.
 */
export function ActionForm({
  action,
  children,
  className,
  onSuccess,
  successToast = true,
  resetOnSuccess = false,
}: {
  action: FormAction;
  children: React.ReactNode;
  className?: string;
  onSuccess?: (r: ClientActionResult & { ok: true }) => void;
  successToast?: boolean;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState<ClientActionResult | null, FormData>(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const last = useRef<ClientActionResult | null>(null);

  useEffect(() => {
    if (!state || state === last.current) return;
    last.current = state;
    if (state.ok) {
      if (successToast && state.message) toast.success(state.message);
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state);
    } else {
      toast.error(state.error);
    }
  }, [state, onSuccess, successToast, resetOnSuccess]);

  const errors = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <ErrorsContext.Provider value={errors}>
      <form
        ref={formRef}
        action={formAction}
        // Submit manually so React 19 doesn't auto-reset the fields — users keep
        // what they typed when validation fails. (Progressive enhancement still
        // works via `action` when JavaScript is unavailable.)
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          startTransition(() => formAction(fd));
        }}
        className={cn("space-y-4", className)}
        noValidate
      >
        {children}
        {errors._form ? <p className="text-sm text-danger">{errors._form}</p> : null}
      </form>
    </ErrorsContext.Provider>
  );
}

export function useFieldError(name: string) {
  return React.useContext(ErrorsContext)[name];
}

export function Field({ label, name, hint, children, className }: { label: string; name: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  const error = useFieldError(name);
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={name}>{label}</Label>
      {children}
      {error ? (
        <p id={`${name}-error`} className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextField({ label, name, hint, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; hint?: React.ReactNode }) {
  const error = useFieldError(name);
  return (
    <Field label={label} name={name} hint={hint} className={className}>
      <Input id={name} name={name} aria-invalid={!!error || undefined} aria-describedby={error ? `${name}-error` : undefined} {...props} />
    </Field>
  );
}

export function MoneyField({ label, name, hint, currencySymbol, className, large, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; hint?: React.ReactNode; currencySymbol: string; large?: boolean }) {
  const error = useFieldError(name);
  return (
    <Field label={label} name={name} hint={hint} className={className}>
      <div className="relative">
        <span className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted", large ? "left-4 text-2xl font-semibold" : "left-3.5 text-base")}>{currencySymbol}</span>
        <Input
          id={name}
          name={name}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          className={cn("tabular", large ? "h-16 pl-11 text-3xl font-semibold" : "pl-9")}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${name}-error` : undefined}
          {...props}
        />
      </div>
    </Field>
  );
}

export function SelectField({ label, name, hint, children, className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; name: string; hint?: React.ReactNode }) {
  const error = useFieldError(name);
  return (
    <Field label={label} name={name} hint={hint} className={className}>
      <NativeSelect id={name} name={name} aria-invalid={!!error || undefined} {...props}>
        {children}
      </NativeSelect>
    </Field>
  );
}

export function TextAreaField({ label, name, hint, className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; name: string; hint?: React.ReactNode }) {
  const error = useFieldError(name);
  return (
    <Field label={label} name={name} hint={hint} className={className}>
      <Textarea id={name} name={name} aria-invalid={!!error || undefined} {...props} />
    </Field>
  );
}

export function CheckboxField({ label, name, description, defaultChecked, onChange }: { label: string; name: string; description?: string; defaultChecked?: boolean; onChange?: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-border bg-background-2 p-3.5">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} onChange={(e) => onChange?.(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]" />
      <span>
        <span className="block text-base font-medium">{label}</span>
        {description ? <span className="block text-sm text-muted">{description}</span> : null}
      </span>
    </label>
  );
}

export function SubmitButton({ children, pendingLabel = "Saving…", className, ...props }: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} className={cn("w-full sm:w-auto", className)} {...props}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" /> {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

export function FormRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2", className)}>{children}</div>;
}

/**
 * Collapses optional fields behind a "More options" toggle so forms show only
 * what's needed. Fields inside are still submitted when collapsed, and the
 * panel opens automatically if the server reports a validation error.
 */
export function MoreOptions({ children, summary, defaultOpen = false }: { children: React.ReactNode; summary?: string; defaultOpen?: boolean }) {
  const errors = React.useContext(ErrorsContext);
  const hasErrors = Object.keys(errors).some((k) => k !== "_form");
  const [userOpen, setUserOpen] = React.useState(defaultOpen);
  return (
    <details
      open={userOpen || hasErrors}
      onToggle={(e) => setUserOpen(e.currentTarget.open)}
      className="group rounded-2xl border border-border [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 text-base font-medium select-none">
        <span className="flex size-6 items-center justify-center rounded-full bg-card-2 text-sm text-foreground transition-transform group-open:rotate-45" aria-hidden>+</span>
        More options (optional)
        {summary ? <span className="hidden truncate text-sm font-normal text-muted sm:inline">· {summary}</span> : null}
      </summary>
      <div className="space-y-4 px-4 pb-4 pt-1">{children}</div>
    </details>
  );
}
