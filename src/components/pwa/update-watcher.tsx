"use client";

import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { compareVersions, type NativePlatform, type NativeRelease } from "@/lib/releases";

const CURRENT_BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const CHECK_EVERY_MS = 10 * 60 * 1000;
const SNOOZE_MS = 24 * 60 * 60 * 1000;

type Prompt = { kind: "reload"; build: string } | { kind: "store"; platform: NativePlatform; url: string; latest: string; notes?: string };

/** Which app is this page running inside, and which version is installed? */
async function detectApp(): Promise<{ platform: NativePlatform | "web"; version: string | null }> {
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  if (cap?.isNativePlatform?.()) {
    try {
      const { App } = await import("@capacitor/app");
      const info = await App.getInfo();
      return { platform: cap.getPlatform?.() === "ios" ? "ios" : "android", version: info.version };
    } catch {
      return { platform: cap.getPlatform?.() === "ios" ? "ios" : "android", version: null };
    }
  }
  const desktop = /FinanceOSDesktop\/([\d.]+)/.exec(navigator.userAgent);
  if (desktop) return { platform: "desktop", version: desktop[1] };
  return { platform: "web", version: null };
}

function snoozed(key: string) {
  try {
    const until = Number(localStorage.getItem(`fos.update.snooze.${key}`) ?? 0);
    return Date.now() < until;
  } catch {
    return false;
  }
}

/**
 * Keeps every platform current.
 * - Website/content updates (all platforms load the live site): "Update now" reloads.
 * - New installed-app builds (Play Store, App Store, desktop): "Update" opens the store/download page.
 * Checks on open, whenever the app returns to the foreground, and every 10 minutes.
 */
export function UpdateWatcher() {
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  useEffect(() => {
    let last = 0;
    const check = async () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 30_000) return;
      last = Date.now();
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { build?: string; native?: Record<NativePlatform, NativeRelease> };
        const app = await detectApp();
        if (app.platform !== "web" && app.version && data.native) {
          const rel = data.native[app.platform];
          if (rel?.url && compareVersions(app.version, rel.latest) < 0 && !snoozed(`${app.platform}-${rel.latest}`)) {
            setPrompt({ kind: "store", platform: app.platform, url: rel.url, latest: rel.latest, notes: rel.notes });
            return;
          }
        }
        if (CURRENT_BUILD !== "dev" && data.build && data.build !== "dev" && data.build !== CURRENT_BUILD && !snoozed(`web-${data.build}`)) {
          setPrompt({ kind: "reload", build: data.build });
        }
      } catch {
        /* offline — try again later */
      }
    };
    check();
    const onVis = () => check();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    const t = setInterval(check, CHECK_EVERY_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
      clearInterval(t);
    };
  }, []);

  if (!prompt) return null;

  const later = () => {
    try {
      const key = prompt.kind === "store" ? `${prompt.platform}-${prompt.latest}` : `web-${prompt.build}`;
      localStorage.setItem(`fos.update.snooze.${key}`, String(Date.now() + (prompt.kind === "store" ? SNOOZE_MS : 60 * 60 * 1000)));
    } catch {}
    setPrompt(null);
  };
  const update = () => {
    if (prompt.kind === "reload") window.location.reload();
    else window.location.href = prompt.url;
  };
  const storeName = prompt.kind === "store" ? (prompt.platform === "android" ? "Play Store" : prompt.platform === "ios" ? "App Store" : "download page") : "";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-[calc(88px+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md lg:bottom-6 lg:left-auto lg:right-6 lg:mx-0"
    >
      <div className="surface-raised enter flex items-start gap-3 rounded-2xl p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <RefreshCw className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold">{prompt.kind === "reload" ? "A new version is ready" : `Update FINANCE OS to ${prompt.latest}`}</p>
          <p className="mt-0.5 text-sm text-muted">
            {prompt.kind === "reload" ? "Tap Update to get the latest improvements. It only takes a second." : prompt.notes ?? `A newer app is available on the ${storeName}.`}
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={update}>{prompt.kind === "reload" ? "Update now" : `Open ${storeName}`}</Button>
            <Button size="sm" variant="ghost" onClick={later}>Later</Button>
          </div>
        </div>
        <button type="button" onClick={later} className="-mr-1 -mt-1 flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-card-2" aria-label="Dismiss update">
          <X className="size-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
