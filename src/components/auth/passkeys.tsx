"use client";

import { useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { browserSupportsWebAuthn, startAuthentication, startRegistration, WebAuthnError } from "@simplewebauthn/browser";
import { Fingerprint, KeyRound, Loader2, ScanFace, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { deletePasskeyAction, passkeyLoginOptionsAction, passkeyLoginVerifyAction, passkeyRegisterOptionsAction, passkeyRegisterVerifyAction } from "@/server/actions/passkeys";

type Platform = "apple" | "android" | "windows" | "other";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod|Macintosh/.test(ua)) return "apple";
  if (/Android/.test(ua)) return "android";
  if (/Windows/.test(ua)) return "windows";
  return "other";
}

/** "Face ID", "fingerprint", "Windows Hello"… — what this device will actually ask for. */
export function biometricLabel(p: Platform) {
  if (p === "apple") return /iPhone|iPad/.test(navigator.userAgent) ? "Face ID" : "Touch ID";
  if (p === "android") return "fingerprint or face unlock";
  if (p === "windows") return "Windows Hello";
  return "a passkey";
}

function deviceName(p: Platform) {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (p === "apple") return "Mac";
  if (p === "android") return "Android phone";
  if (p === "windows") return "Windows PC";
  return "This device";
}

/** Passkeys work in real browsers (incl. iPhone home-screen apps); the native app shell uses its own app lock. */
const noop = () => () => {};
let cached: { ok: boolean; platform: Platform } | null = null;
const SERVER = { ok: false, platform: "other" as Platform };
function usePasskeySupport() {
  return useSyncExternalStore(
    noop,
    () => {
      if (!cached) {
        const native = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
        cached = { ok: !native && browserSupportsWebAuthn(), platform: detectPlatform() };
      }
      return cached;
    },
    () => SERVER,
  );
}

function friendlyError(e: unknown, label: string) {
  if (e instanceof WebAuthnError) {
    if (e.code === "ERROR_CEREMONY_ABORTED" || e.name === "NotAllowedError") return `${label} was cancelled.`;
    if (e.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") return `${label} is already set up on this device.`;
  }
  if (e instanceof Error && e.name === "NotAllowedError") return `${label} was cancelled.`;
  return `${label} didn't work. Please try again.`;
}

/** Login page: "Sign in with Face ID". */
export function PasskeySignIn({ next }: { next?: string }) {
  const { ok, platform } = usePasskeySupport();
  const [busy, start] = useTransition();
  const router = useRouter();
  if (!ok) return null;
  const label = biometricLabel(platform);
  const Icon = platform === "apple" ? ScanFace : Fingerprint;

  const signIn = () =>
    start(async () => {
      const opts = await passkeyLoginOptionsAction();
      if (!opts.ok) return void toast.error(opts.error);
      let assertion;
      try {
        assertion = await startAuthentication({ optionsJSON: opts.data });
      } catch (e) {
        return void toast.error(friendlyError(e, `Sign-in with ${label}`));
      }
      const res = await passkeyLoginVerifyAction(assertion, next ?? "/dashboard");
      if (!res.ok) return void toast.error(res.error);
      router.replace(res.data.redirect);
      router.refresh();
    });

  return (
    <div className="mt-5">
      <div className="mb-4 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
      <Button type="button" variant="secondary" className="w-full" onClick={signIn} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Icon />} Sign in with {label === "a passkey" ? "a passkey" : label}
      </Button>
      <p className="mt-2 text-center text-[11px] text-muted">Set it up first in Settings → Security after signing in with your password.</p>
    </div>
  );
}

export interface PasskeyRow {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

/** Settings → Security: set up / remove Face ID sign-in. */
export function PasskeyManager({ passkeys }: { passkeys: PasskeyRow[] }) {
  const { ok, platform } = usePasskeySupport();
  const [busy, start] = useTransition();
  const router = useRouter();
  const label = biometricLabel(platform);
  const Icon = platform === "apple" ? ScanFace : Fingerprint;

  const add = () =>
    start(async () => {
      const opts = await passkeyRegisterOptionsAction();
      if (!opts.ok) return void toast.error(opts.error);
      let attestation;
      try {
        attestation = await startRegistration({ optionsJSON: opts.data });
      } catch (e) {
        return void toast.error(friendlyError(e, `${label[0].toUpperCase()}${label.slice(1)} setup`));
      }
      const res = await passkeyRegisterVerifyAction(attestation, deviceName(platform));
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${label[0].toUpperCase()}${label.slice(1)} sign-in is on for this device`);
      router.refresh();
    });

  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"><Icon className="size-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Sign in with {ok ? label : "Face ID or fingerprint"}</p>
          <p className="text-xs text-muted">
            Uses a passkey: your face or fingerprint never leaves your device. You can still sign in with your password.
          </p>
        </div>
      </div>
      {passkeys.length ? (
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <KeyRound className="size-4 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{p.name}</p>
                <p className="text-[11px] text-muted">Added {fmt(p.created_at)}{p.last_used_at ? ` · last used ${fmt(p.last_used_at)}` : ""}</p>
              </div>
              <ConfirmDialog
                trigger={<Button variant="ghost" size="icon-sm" aria-label={`Remove ${p.name}`}><Trash2 /></Button>}
                title="Remove this passkey?"
                description="You won't be able to sign in with it any more. Your password still works."
                confirmLabel="Remove"
                onConfirm={async () => {
                  const r = await deletePasskeyAction(p.id);
                  if (!r.ok) toast.error(r.error);
                  else {
                    toast.success("Passkey removed");
                    router.refresh();
                  }
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {ok ? (
        <Button type="button" variant={passkeys.length ? "secondary" : "default"} size="sm" onClick={add} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Icon />} {passkeys.length ? "Add another device" : `Set up ${label}`}
        </Button>
      ) : (
        <p className="text-xs text-muted">Open FINANCE OS in Safari, Chrome or Edge on your phone or computer to set this up.</p>
      )}
    </div>
  );
}
