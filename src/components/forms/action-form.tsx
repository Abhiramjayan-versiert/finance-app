"use client";

import * as React from "react";
import { useActionState, useEffect, useRef } from "react";
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
      <form ref={formRef} action={formAction} className={cn("space-y-4", className)} noValidate>
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
        <p id={`${name}-error`} className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
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

export function MoneyField({ label, name, hint, currencySymbol, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; hint?: React.ReactNode; currencySymbol: string }) {
  const error = useFieldError(name);
  return (
    <Field label={label} name={name} hint={hint} className={className}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">{currencySymbol}</span>
        <Input id={name} name={name} inputMode="decimal" autoComplete="off" placeholder="0" className="pl-8 tabular" aria-invalid={!!error || undefined} {...props} />
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
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background-2 p-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} onChange={(e) => onChange?.(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description ? <span className="block text-xs text-muted">{description}</span> : null}
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
