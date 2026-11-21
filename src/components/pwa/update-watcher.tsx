"use client";

import { useEffect } from "react";
import { toast } from "sonner";

const CURRENT = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const CHECK_EVERY_MS = 10 * 60 * 1000;

/**
 * Home-screen apps (iOS/Android) and the phone app stay in memory for days and
 * never reload, so they keep running old code. Whenever the app returns to the
 * foreground (and every 10 minutes), check which build is live; if it changed,
 * reload — immediately when nothing is being edited, otherwise offer a button.
 */
export function UpdateWatcher() {
  useEffect(() => {
    if (CURRENT === "dev") return;
    let last = 0;
    let offered = false;

    const busy = () => {
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return true;
      const a = document.activeElement;
      return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT");
    };

    const check = async () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 30_000) return;
      last = Date.now();
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { build } = (await res.json()) as { build?: string };
        if (!build || build === "dev" || build === CURRENT) return;
        // Never loop: auto-reload at most once per target build per 2 minutes.
        let recent = false;
        try {
          const prev = JSON.parse(sessionStorage.getItem("fos.reloadedFor") ?? "null") as { build: string; at: number } | null;
          recent = !!prev && prev.build === build && Date.now() - prev.at < 120_000;
        } catch {}
        if (!busy() && !recent) {
          try {
            sessionStorage.setItem("fos.reloadedFor", JSON.stringify({ build, at: Date.now() }));
          } catch {}
          window.location.reload();
        } else if (!offered) {
          offered = true;
          toast("A new version of FINANCE OS is ready", { duration: Infinity, action: { label: "Update", onClick: () => window.location.reload() } });
        }
      } catch {
        /* offline — try again later */
      }
    };

    check();
    const onVis = () => check();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    window.addEventListener("pageshow", onVis);
    const t = setInterval(check, CHECK_EVERY_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
      window.removeEventListener("pageshow", onVis);
      clearInterval(t);
    };
  }, []);
  return null;
}
