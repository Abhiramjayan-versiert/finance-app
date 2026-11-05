"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { ActionForm, CheckboxField, SubmitButton, TextField, useFieldError, type FormAction } from "@/components/forms/action-form";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { forgotPasswordAction, loginAction, registerAction, resendOtpAction, resetPasswordAction, verifyOtpAction } from "@/server/actions/auth";

function PasswordField({ name, label, autoComplete, hint }: { name: string; label: string; autoComplete: string; hint?: string }) {
  const [show, setShow] = useState(false);
  const error = useFieldError(name);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <div className="relative">
        <Input id={name} name={name} type={show ? "text" : "password"} autoComplete={autoComplete} required aria-invalid={!!error || undefined} className="pr-10" />
        <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-foreground" aria-label={show ? "Hide password" : "Show password"}>
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {error ? <p className="text-xs text-danger" role="alert">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function LoginForm({ next }: { next?: string }) {
  return (
    <ActionForm action={loginAction as FormAction}>
      <input type="hidden" name="next" value={next ?? "/dashboard"} />
      <TextField label="Email" name="email" type="email" autoComplete="email" required autoFocus />
      <PasswordField name="password" label="Password" autoComplete="current-password" />
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-xs text-muted hover:text-foreground">Forgot password?</Link>
      </div>
      <SubmitButton className="w-full sm:w-full" pendingLabel="Signing in…">Sign in</SubmitButton>
    </ActionForm>
  );
}

export function RegisterForm() {
  return (
    <ActionForm action={registerAction as FormAction}>
      <TextField label="Full name" name="fullName" autoComplete="name" required autoFocus />
      <TextField label="Email" name="email" type="email" autoComplete="email" required />
      <PasswordField name="password" label="Password" autoComplete="new-password" hint="At least 8 characters with upper & lowercase letters and a number." />
      <PasswordField name="confirmPassword" label="Confirm password" autoComplete="new-password" />
      <TermsField />
      <SubmitButton className="w-full sm:w-full" pendingLabel="Creating account…">Create free account</SubmitButton>
    </ActionForm>
  );
}

function TermsField() {
  const error = useFieldError("terms");
  return (
    <div>
      <CheckboxField name="terms" label="I accept the Terms and Privacy Policy" description="FINANCE OS is a planning tool, not a bank. We never ask for banking passwords or card details." />
      <p className="mt-1 text-xs">
        <Link href="/terms" target="_blank" className="text-accent hover:underline">Read terms</Link> · <Link href="/privacy" target="_blank" className="text-accent hover:underline">Privacy</Link>
      </p>
      {error ? <p className="mt-1 text-xs text-danger" role="alert">{error}</p> : null}
    </div>
  );
}

export function VerifyForm({ email }: { email: string }) {
  return (
    <div className="space-y-5">
      <ActionForm action={verifyOtpAction as FormAction}>
        <TextField label="Email" name="email" type="email" defaultValue={email} autoComplete="email" required readOnly={!!email} />
        <TextField label="Verification code" name="token" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={8} placeholder="6-digit code" required autoFocus className="text-center text-lg tracking-[0.4em] tabular" />
        <SubmitButton className="w-full sm:w-full" pendingLabel="Verifying…">Verify email</SubmitButton>
      </ActionForm>
      <ActionForm action={resendOtpAction as FormAction} className="space-y-0">
        <input type="hidden" name="email" value={email} />
        <p className="text-center text-xs text-muted">
          Didn&apos;t get a code? Check spam, or{" "}
          <ResendButton disabled={!email} />
        </p>
      </ActionForm>
    </div>
  );
}

function ResendButton({ disabled }: { disabled?: boolean }) {
  return (
    <Button type="submit" variant="link" size="sm" className="h-auto text-xs" disabled={disabled}>
      resend the code
    </Button>
  );
}

export function ForgotPasswordForm() {
  return (
    <ActionForm action={forgotPasswordAction as FormAction}>
      <TextField label="Email" name="email" type="email" autoComplete="email" required autoFocus />
      <SubmitButton className="w-full sm:w-full" pendingLabel="Sending…">Send reset code</SubmitButton>
    </ActionForm>
  );
}

export function ResetPasswordForm({ email }: { email: string }) {
  return (
    <ActionForm action={resetPasswordAction as FormAction}>
      <TextField label="Email" name="email" type="email" defaultValue={email} required />
      <TextField label="Reset code" name="token" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required className="tracking-[0.3em] tabular" />
      <PasswordField name="password" label="New password" autoComplete="new-password" hint="At least 8 characters with upper & lowercase letters and a number." />
      <PasswordField name="confirmPassword" label="Confirm new password" autoComplete="new-password" />
      <SubmitButton className="w-full sm:w-full" pendingLabel="Updating…">Set new password</SubmitButton>
    </ActionForm>
  );
}
