"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { startAuthentication, WebAuthnError } from "@simplewebauthn/browser";
import { Fingerprint, Loader2, Lock, ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { LogoMark } from "@/components/shared/logo";
import { logoutAction } from "@/server/actions/auth";
import { appLockEngagedAction, passkeyUnlockOptionsAction, passkeyUnlockVerifyAction } from "@/server/actions/passkeys";
import { biometricLabel, usePasskeySupport } from "./passkeys";

/**
 * App lock for browsers, home-screen apps and the desktop app (the phone apps
 * use their native biometric lock instead). Unlocks with this device's
 * passkey — fingerprint, Face ID, Touch ID or Windows Hello — verified by the
 * server against the signed-in account.
 *
 * The on/off choice lives in a cookie so the server can render the lock screen
 * immediately (no flash of financial data before it appears).
 */
import { LOCK_COOKIE } from "@/lib/app-lock";
const RELOCK_AFTER_MS = 60_000;

const isNative = () => !!(window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

function setLockCookie(on: boolean) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = on ? `${LOCK_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax${secure}` : `${LOCK_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

async function confirmIdentity(label: string): Promise<boolean> {
  const opts = await passkeyUnlockOptionsAction();
  if (!opts.ok) {
    toast.error(opts.error);
    return false;
  }
  try {
    const assertion = await startAuthentication({ optionsJSON: opts.data });
    const res = await passkeyUnlockVerifyAction(assertion);
    if (!res.ok) toast.error(res.error);
    return res.ok;
  } catch (e) {
    const cancelled = (e instanceof WebAuthnError && e.code === "ERROR_CEREMONY_ABORTED") || (e instanceof Error && e.name === "NotAllowedError");
    toast.error(cancelled ? `${label} was cancelled.` : `${label} didn't work on this device.`);
    return false;
  }
}

export function WebAppLock({ enabled: lockOn, initiallyLocked }: { enabled: boolean; initiallyLocked: boolean }) {
  const { platform } = usePasskeySupport();
  const label = biometricLabel(platform);
  const Icon = platform === "apple" ? ScanFace : Fingerprint;
  const [locked, setLocked] = useState(initiallyLocked);
  const [busy, start] = useTransition();
  const hiddenAt = useRef<number | null>(null);
  const enabled = useRef(lockOn);

  useEffect(() => {
    if (isNative()) {
      setTimeout(() => setLocked(false), 0); // phone apps use their own native lock
      return;
    }
    const onPref = (e: Event) => {
      enabled.current = Boolean((e as CustomEvent<boolean>).detail);
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") hiddenAt.current = Date.now();
      else if (enabled.current && hiddenAt.current && Date.now() - hiddenAt.current > RELOCK_AFTER_MS) {
        setLocked(true);
        appLockEngagedAction().catch(() => {});
      }
    };
    window.addEventListener("fos:weblock", onPref);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("fos:weblock", onPref);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  if (!locked) return null;

  const unlock = () =>
    start(async () => {
      if (await confirmIdentity(`Unlock with ${label}`)) setLocked(false);
    });

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background px-8 text-center" role="dialog" aria-modal="true" aria-label="FINANCE OS is locked">
      <LogoMark className="size-16" />
      <p className="mt-6 flex items-center gap-2 text-xl font-semibold"><Lock className="size-5" aria-hidden /> FINANCE OS is locked</p>
      <p className="mt-2 max-w-xs text-base text-muted">Use {label} to open your workspace.</p>
      <Button className="mt-8 min-w-56" onClick={unlock} disabled={busy} autoFocus>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Icon aria-hidden />} Unlock
      </Button>
      <form action={logoutAction} className="mt-3">
        <Button type="submit" variant="ghost">Sign out instead</Button>
      </form>
    </div>
  );
}

/** Settings → Security toggle (browsers & desktop). Hidden inside the phone apps. */
export function WebAppLockSetting({ hasPasskey, initiallyOn }: { hasPasskey: boolean; initiallyOn: boolean }) {
  const { ok, platform } = usePasskeySupport();
  const label = biometricLabel(platform);
  const [on, setOn] = useState(initiallyOn);
  const [busy, start] = useTransition();
  const router = useRouter();
  if (!ok) return null; // native app (own lock) or a browser without passkeys

  const toggle = (next: boolean) =>
    start(async () => {
      if (next && !(await confirmIdentity(`${label[0].toUpperCase()}${label.slice(1)}`))) return;
      setLockCookie(next);
      window.dispatchEvent(new CustomEvent("fos:weblock", { detail: next }));
      setOn(next);
      toast.success(next ? `App lock is on — FINANCE OS will ask for ${label}` : "App lock is off");
      router.refresh();
    });

  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-border p-4">
      <div className="min-w-0">
        <p className="text-base font-medium">Lock the app with {label}</p>
        <p className="text-sm text-muted">
          {hasPasskey
            ? "Asks for it when you open FINANCE OS, and after a minute away."
            : `Set up ${label} sign-in above first, then turn this on.`}
        </p>
      </div>
      <Switch checked={on} disabled={!hasPasskey || busy} onCheckedChange={toggle} aria-label="App lock" />
    </div>
  );
}
