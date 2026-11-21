"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Fingerprint, Lock } from "lucide-react";
import { getPrefs, hapticResult, hapticTap, isNativeApp, nativeDownload, syncReminders, verifyIdentity } from "@/lib/native";
import { LogoMark } from "@/components/shared/logo";

/** Areas of the app that hold financial data and sit behind the app lock. */
const PRIVATE = ["/dashboard", "/transactions", "/income", "/expenses", "/budgets", "/goals", "/savings", "/investments", "/debts", "/net-worth", "/calculators", "/reports", "/achievements", "/notifications", "/settings", "/admin"];
const isPrivate = (p: string) => PRIVATE.some((x) => p === x || p.startsWith(`${x}/`));

/** Re-lock after the app has been in the background this long. */
const RELOCK_MS = 30_000;

/**
 * Native glue for the phone app. Renders nothing in a normal browser.
 * - Biometric / screen-lock app lock (on launch and after 30s in background)
 * - Privacy cover in the app switcher
 * - Bill/EMI + daily reminders scheduled on the device
 * - Haptics, status bar theming, Android back button, file exports via share sheet
 */
export function NativeBridge() {
  const [native] = useState(isNativeApp);
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  // "checking" covers the screen until we know whether the lock is on.
  const [lock, setLock] = useState<"checking" | "locked" | "open">(native ? "checking" : "open");
  const [cover, setCover] = useState(false);
  const lockEnabled = useRef(false);
  const backgroundedAt = useRef<number | null>(null);
  const prompting = useRef(false);
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  async function unlock() {
    if (prompting.current) return;
    prompting.current = true;
    const ok = await verifyIdentity();
    prompting.current = false;
    if (ok) {
      setLock("open");
      hapticResult("success");
    } else {
      hapticResult("error");
    }
  }

  // Initial lock state + reminders.
  useEffect(() => {
    if (!native) return;
    let alive = true;
    getPrefs().then((p) => {
      if (!alive) return;
      lockEnabled.current = p.lockEnabled;
      const needsLock = p.lockEnabled && isPrivate(pathRef.current);
      setLock(needsLock ? "locked" : "open");
      if (needsLock) setTimeout(unlock, 250);
      if (isPrivate(pathRef.current)) syncReminders(p).catch(() => {});
    });
    const onPrefs = (e: Event) => {
      lockEnabled.current = Boolean((e as CustomEvent<{ lockEnabled: boolean }>).detail?.lockEnabled);
    };
    window.addEventListener("fos:prefs", onPrefs);
    return () => {
      alive = false;
      window.removeEventListener("fos:prefs", onPrefs);
    };
  }, [native]);

  // App lifecycle, back button, notification taps.
  useEffect(() => {
    if (!native) return;
    const subs: Array<{ remove: () => Promise<void> }> = [];
    let cancelled = false;
    (async () => {
      const [{ App }, { LocalNotifications }, { SplashScreen }] = await Promise.all([import("@capacitor/app"), import("@capacitor/local-notifications"), import("@capacitor/splash-screen")]);
      if (cancelled) return;
      SplashScreen.hide().catch(() => {});
      subs.push(
        await App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) {
            backgroundedAt.current = Date.now();
            if (lockEnabled.current && isPrivate(pathRef.current)) setCover(true);
            return;
          }
          const away = backgroundedAt.current ? Date.now() - backgroundedAt.current : 0;
          backgroundedAt.current = null;
          setCover(false);
          if (lockEnabled.current && isPrivate(pathRef.current) && away > RELOCK_MS) {
            setLock("locked");
            setTimeout(unlock, 250);
          }
          if (isPrivate(pathRef.current) && away > 60_000) syncReminders().catch(() => {});
        }),
      );
      subs.push(
        await App.addListener("backButton", ({ canGoBack }) => {
          // Close an open dialog/menu/sheet first, like a native app.
          const overlay = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]');
          if (overlay) {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
            overlay.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
            return;
          }
          const p = pathRef.current;
          if (p === "/dashboard" || p === "/" || p === "/login") App.exitApp();
          else if (canGoBack) window.history.back();
          else router.push("/dashboard");
        }),
      );
      subs.push(
        await LocalNotifications.addListener("localNotificationActionPerformed", (e) => {
          const link = (e.notification.extra as { link?: string } | undefined)?.link;
          if (link && link.startsWith("/")) router.push(link);
        }),
      );
    })();
    return () => {
      cancelled = true;
      subs.forEach((s) => s.remove().catch(() => {}));
    };
  }, [native, router]);

  // Status bar follows the theme.
  useEffect(() => {
    if (!native) return;
    import("@capacitor/status-bar").then(({ StatusBar, Style }) => {
      const dark = resolvedTheme !== "light";
      StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
      StatusBar.setBackgroundColor({ color: dark ? "#08080a" : "#eceef2" }).catch(() => {});
    });
  }, [native, resolvedTheme]);

  // Haptics on taps and on success/error toasts.
  useEffect(() => {
    if (!native) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target instanceof Element ? e.target.closest(".press, button, [role='menuitem'], [role='tab'], [role='switch']") : null;
      if (t && !(t as HTMLButtonElement).disabled) hapticTap();
    };
    document.addEventListener("pointerdown", onDown, { capture: true, passive: true });
    const mo = new MutationObserver((muts) => {
      for (const m of muts)
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          const toast = n.matches("[data-sonner-toast]") ? n : n.querySelector("[data-sonner-toast]");
          const type = toast?.getAttribute("data-type");
          if (type === "success") hapticResult("success");
          else if (type === "error") hapticResult("error");
          else if (type === "warning") hapticResult("warning");
        });
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("pointerdown", onDown, { capture: true });
      mo.disconnect();
    };
  }, [native]);

  // Exports: Android WebView can't download files, so route them to the share sheet.
  useEffect(() => {
    if (!native) return;
    const onClick = (e: MouseEvent) => {
      const a = e.target instanceof Element ? (e.target.closest("a[href]") as HTMLAnchorElement | null) : null;
      if (!a) return;
      const url = new URL(a.href, location.href);
      const isExport = url.origin === location.origin && url.pathname.startsWith("/api/export");
      if (!isExport && !a.hasAttribute("download")) return;
      e.preventDefault();
      e.stopPropagation();
      import("sonner").then(({ toast }) =>
        toast.promise(nativeDownload(url.toString(), a.getAttribute("download") || undefined), {
          loading: "Preparing your file…",
          success: "Ready — choose where to save it",
          error: "Couldn't prepare the file. Try again.",
        }),
      );
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [native]);

  if (!native) return null;

  const showLock = (lock === "checking" || lock === "locked") && isPrivate(pathname);
  if (!showLock && !cover) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background px-8 text-center" role={showLock ? "dialog" : undefined} aria-modal={showLock || undefined} aria-label={showLock ? "App locked" : undefined}>
      <LogoMark className="size-16" />
      {showLock && lock === "locked" ? (
        <>
          <p className="mt-6 flex items-center gap-2 text-lg font-semibold"><Lock className="size-4" /> FINANCE OS is locked</p>
          <p className="mt-1.5 max-w-xs text-sm text-muted">Use your fingerprint, face or screen lock to open your workspace.</p>
          <button onClick={unlock} className="press mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 font-semibold text-accent-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
            <Fingerprint className="size-5" /> Unlock
          </button>
        </>
      ) : null}
    </div>
  );
}
