"use client";

/**
 * Helpers for the FINANCE OS phone app (Capacitor shell). Every function is a
 * safe no-op in a normal browser, and plugin code is loaded only on device.
 */
import { Capacitor } from "@capacitor/core";

export const isNativeApp = () => typeof window !== "undefined" && Capacitor.isNativePlatform();

// ---------- Preferences ----------
export type AppPrefs = {
  lockEnabled: boolean;
  billReminders: boolean;
  dailyReminder: boolean;
  dailyTime: string; // "HH:mm"
};
export const DEFAULT_PREFS: AppPrefs = { lockEnabled: false, billReminders: true, dailyReminder: false, dailyTime: "20:00" };
const PREFS_KEY = "fos.app.prefs";

export async function getPrefs(): Promise<AppPrefs> {
  if (!isNativeApp()) return DEFAULT_PREFS;
  const { Preferences } = await import("@capacitor/preferences");
  try {
    const { value } = await Preferences.get({ key: PREFS_KEY });
    return { ...DEFAULT_PREFS, ...(value ? (JSON.parse(value) as Partial<AppPrefs>) : {}) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function setPrefs(patch: Partial<AppPrefs>): Promise<AppPrefs> {
  const next = { ...(await getPrefs()), ...patch };
  if (isNativeApp()) {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: PREFS_KEY, value: JSON.stringify(next) });
  }
  return next;
}

// ---------- Haptics ----------
let lastTap = 0;
export async function hapticTap() {
  if (!isNativeApp()) return;
  const now = Date.now();
  if (now - lastTap < 60) return;
  lastTap = now;
  const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}
export async function hapticResult(kind: "success" | "warning" | "error") {
  if (!isNativeApp()) return;
  const { Haptics, NotificationType } = await import("@capacitor/haptics");
  const type = kind === "success" ? NotificationType.Success : kind === "warning" ? NotificationType.Warning : NotificationType.Error;
  Haptics.notification({ type }).catch(() => {});
}

// ---------- Biometric lock ----------
export async function biometricAvailable(): Promise<{ available: boolean; label: string }> {
  if (!isNativeApp()) return { available: false, label: "" };
  const { NativeBiometric, BiometryType } = await import("@capgo/capacitor-native-biometric");
  try {
    const r = await NativeBiometric.isAvailable({ useFallback: true });
    const t = r.biometryType;
    const label =
      t === BiometryType.MULTIPLE
        ? "Fingerprint or face"
        : t === BiometryType.FACE_ID
          ? "Face ID"
          : t === BiometryType.TOUCH_ID
            ? "Touch ID"
            : t === BiometryType.FACE_AUTHENTICATION
              ? "Face unlock"
              : t === BiometryType.FINGERPRINT
                ? "Fingerprint"
                : "Screen lock (PIN, pattern or password)";
    return { available: r.isAvailable, label };
  } catch {
    return { available: false, label: "" };
  }
}

export async function verifyIdentity(): Promise<boolean> {
  if (!isNativeApp()) return true;
  const { NativeBiometric, BiometryType } = await import("@capgo/capacitor-native-biometric");
  try {
    await NativeBiometric.verifyIdentity({
      // Fingerprint, face or iris — or the phone's PIN/pattern/password.
      allowedBiometryTypes: [BiometryType.FINGERPRINT, BiometryType.FACE_AUTHENTICATION, BiometryType.IRIS_AUTHENTICATION, BiometryType.DEVICE_CREDENTIAL],
      reason: "Unlock your FINANCE OS workspace",
      title: "Unlock FINANCE OS",
      subtitle: "Confirm it's you",
      useFallback: true,
      maxAttempts: 5,
    });
    return true;
  } catch {
    return false;
  }
}

// ---------- Reminders (on-device notifications) ----------
const BILL_ID_BASE = 1000; // ids 1000–1199 are bill/EMI reminders
const DAILY_ID = 1;

type ReminderItem = { key: string; date: string; title: string; amount: string; kind: "recurring_expense" | "recurring_income" | "emi"; link: string };

export async function notificationsAllowed(request: boolean): Promise<boolean> {
  if (!isNativeApp()) return false;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  let p = await LocalNotifications.checkPermissions();
  if (p.display !== "granted" && request) p = await LocalNotifications.requestPermissions();
  return p.display === "granted";
}

function at(dateISO: string, hh: number, mm = 0) {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

/** Re-schedules all reminders from the server's upcoming list + preferences. */
export async function syncReminders(prefs?: AppPrefs) {
  if (!isNativeApp()) return;
  const p = prefs ?? (await getPrefs());
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  if (!(await notificationsAllowed(false))) return;

  const pending = await LocalNotifications.getPending();
  const ours = pending.notifications.filter((n) => n.id === DAILY_ID || (n.id >= BILL_ID_BASE && n.id < BILL_ID_BASE + 200));
  if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });

  const toSchedule: Parameters<typeof LocalNotifications.schedule>[0]["notifications"] = [];

  if (p.dailyReminder) {
    const [hh, mm] = p.dailyTime.split(":").map(Number);
    toSchedule.push({
      id: DAILY_ID,
      title: "Log today's spending",
      body: "Take 10 seconds to add today's expenses and keep your budget accurate.",
      schedule: { on: { hour: hh || 20, minute: mm || 0 }, allowWhileIdle: true },
      extra: { link: "/dashboard" },
    });
  }

  if (p.billReminders) {
    try {
      const res = await fetch("/api/reminders", { cache: "no-store", credentials: "include" });
      if (res.ok) {
        const { items } = (await res.json()) as { items: ReminderItem[] };
        const now = Date.now();
        let id = BILL_ID_BASE;
        for (const it of items) {
          if (id >= BILL_ID_BASE + 198) break;
          const income = it.kind === "recurring_income";
          const dayBefore = at(it.date, 9);
          dayBefore.setDate(dayBefore.getDate() - 1);
          const sameDay = at(it.date, 9);
          if (!income && dayBefore.getTime() > now) {
            toSchedule.push({ id: id++, title: `Due tomorrow: ${it.title}`, body: `${it.amount} is due tomorrow.`, schedule: { at: dayBefore, allowWhileIdle: true }, extra: { link: it.link } });
          }
          if (sameDay.getTime() > now) {
            toSchedule.push({
              id: id++,
              title: income ? `Expected today: ${it.title}` : `Due today: ${it.title}`,
              body: income ? `${it.amount} should arrive today.` : `${it.amount} is due today.`,
              schedule: { at: sameDay, allowWhileIdle: true },
              extra: { link: it.link },
            });
          }
        }
      }
    } catch {
      /* offline — keep going */
    }
  }

  if (toSchedule.length) await LocalNotifications.schedule({ notifications: toSchedule });
}

// ---------- Downloads (WebView can't save files; use the share sheet) ----------
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function filenameFrom(res: Response, fallback: string) {
  const cd = res.headers.get("content-disposition") ?? "";
  const m = /filename="?([^";]+)"?/i.exec(cd);
  return (m?.[1] ?? fallback).replace(/[^\w.\-]+/g, "_");
}

export async function nativeDownload(href: string, suggestedName?: string) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
  const res = await fetch(href, { credentials: "include" });
  if (!res.ok) throw new Error("Download failed");
  const blob = await res.blob();
  const ext = blob.type.includes("pdf") ? "pdf" : blob.type.includes("sheet") ? "xlsx" : blob.type.includes("json") ? "json" : "csv";
  const name = suggestedName ? suggestedName.replace(/[^\w.\-]+/g, "_") : filenameFrom(res, `finance-os-export.${ext}`);
  const written = await Filesystem.writeFile({ path: name, data: await blobToBase64(blob), directory: Directory.Cache });
  await Share.share({ title: name, files: [written.uri], dialogTitle: "Save or share your file" });
}
