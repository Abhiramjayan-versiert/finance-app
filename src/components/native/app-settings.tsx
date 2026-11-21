"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, CalendarClock, Fingerprint } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { biometricAvailable, DEFAULT_PREFS, getPrefs, isNativeApp, notificationsAllowed, setPrefs, syncReminders, verifyIdentity, type AppPrefs } from "@/lib/native";

/** Phone-app-only settings: app lock and on-device reminders. Hidden on the web. */
export function AppSettings() {
  const [native] = useState(isNativeApp);
  const [prefs, setState] = useState<AppPrefs>(DEFAULT_PREFS);
  const [bio, setBio] = useState<{ available: boolean; label: string }>({ available: false, label: "" });

  useEffect(() => {
    if (!native) return;
    getPrefs().then(setState);
    biometricAvailable().then(setBio);
  }, [native]);

  if (!native) return null;

  async function update(patch: Partial<AppPrefs>) {
    const next = await setPrefs(patch);
    setState(next);
    window.dispatchEvent(new CustomEvent("fos:prefs", { detail: next }));
    await syncReminders(next).catch(() => {});
  }

  async function toggleLock(on: boolean) {
    if (on) {
      if (!bio.available) {
        toast.error("Set up a fingerprint, face unlock or screen lock in your phone's settings first.");
        return;
      }
      if (!(await verifyIdentity())) return;
    }
    await update({ lockEnabled: on });
    toast.success(on ? "App lock is on" : "App lock is off");
  }

  async function toggleReminder(key: "billReminders" | "dailyReminder", on: boolean) {
    if (on && !(await notificationsAllowed(true))) {
      toast.error("Allow notifications for FINANCE OS in your phone's settings to get reminders.");
      return;
    }
    await update({ [key]: on });
  }

  const row = "flex items-start justify-between gap-4 py-3.5";
  return (
    <section id="app" className="glass min-w-0 scroll-mt-24 rounded-[22px] p-5 sm:p-6">
      <h2 className="text-[15px] font-semibold tracking-tight">Phone app</h2>
      <p className="mt-0.5 text-[13px] text-muted">Security and reminders on this device.</p>
      <div className="mt-2 divide-y divide-border">
        <div className={row}>
          <div className="flex gap-3">
            <Fingerprint className="mt-0.5 size-5 shrink-0 text-accent" />
            <div>
              <p className="text-sm font-medium">App lock</p>
              <p className="text-xs text-muted">{bio.available ? `Ask for ${/^(Face ID|Touch ID)$/.test(bio.label) ? bio.label : bio.label.toLowerCase()} when opening the app, and after 30 seconds away.` : "Needs Face ID, Touch ID, a fingerprint or a screen lock on this phone."}</p>
            </div>
          </div>
          <Switch checked={prefs.lockEnabled} onCheckedChange={toggleLock} aria-label="App lock" />
        </div>
        <div className={row}>
          <div className="flex gap-3">
            <CalendarClock className="mt-0.5 size-5 shrink-0 text-accent" />
            <div>
              <p className="text-sm font-medium">Bill &amp; EMI reminders</p>
              <p className="text-xs text-muted">A reminder the day before and on the day a recurring bill or loan EMI is due.</p>
            </div>
          </div>
          <Switch checked={prefs.billReminders} onCheckedChange={(v) => toggleReminder("billReminders", v)} aria-label="Bill and EMI reminders" />
        </div>
        <div className={row}>
          <div className="flex gap-3">
            <Bell className="mt-0.5 size-5 shrink-0 text-accent" />
            <div>
              <p className="text-sm font-medium">Daily spending reminder</p>
              <p className="text-xs text-muted">A gentle nudge to log the day&apos;s expenses.</p>
              {prefs.dailyReminder ? (
                <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                  Remind me at
                  <Input type="time" className="h-9 w-32" value={prefs.dailyTime} onChange={(e) => e.target.value && update({ dailyTime: e.target.value })} />
                </label>
              ) : null}
            </div>
          </div>
          <Switch checked={prefs.dailyReminder} onCheckedChange={(v) => toggleReminder("dailyReminder", v)} aria-label="Daily spending reminder" />
        </div>
      </div>
    </section>
  );
}
