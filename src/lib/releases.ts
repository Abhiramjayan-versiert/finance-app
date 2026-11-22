/**
 * Single source of truth for app releases on every platform.
 *
 * Website changes go live everywhere instantly (all apps load the live site);
 * the in-app prompt then offers "Update" to reload. When a NEW NATIVE BUILD is
 * published (Play Store, App Store, desktop installer), bump `latest` here and
 * deploy — apps older than that show "Update from the store".
 */
export type NativePlatform = "android" | "ios" | "desktop";

export interface NativeRelease {
  /** Newest published version of the installed app. */
  latest: string;
  /** Where people get it. null = not published yet (no store prompt shown). */
  url: string | null;
  /** What's new, one short line. */
  notes?: string;
}

export const NATIVE_RELEASES: Record<NativePlatform, NativeRelease> = {
  android: {
    latest: "1.1.0",
    url: process.env.NEXT_PUBLIC_ANDROID_STORE_URL || "https://play.google.com/store/apps/details?id=com.versiert.financeos",
    notes: "Stay signed in after closing the app, fingerprint lock and in-app update prompts.",
  },
  ios: {
    latest: "1.0.0",
    url: process.env.NEXT_PUBLIC_IOS_STORE_URL || null,
  },
  desktop: {
    latest: "1.0.0",
    url: "/download",
  },
};

/** Compares dotted versions: -1 if a < b, 0 if equal, 1 if a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}
