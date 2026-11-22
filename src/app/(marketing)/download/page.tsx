import type { Metadata } from "next";
import Link from "next/link";
import { Apple, Globe, Monitor, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NATIVE_RELEASES } from "@/lib/releases";

export const metadata: Metadata = { title: "Download", description: "Get FINANCE OS on Android, iPhone, Windows, Mac or any browser." };

const DESKTOP_URL = process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL || null;

function Row({ icon: Icon, title, text, action }: { icon: typeof Globe; title: string; text: React.ReactNode; action?: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-card-2"><Icon className="size-6" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="mt-0.5 text-base text-muted">{text}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </li>
  );
}

/** Where to get FINANCE OS on every platform. Every app shows the same live account. */
export default function DownloadPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Get FINANCE OS</h1>
      <p className="mt-2 text-lg text-muted">One account, every device. Your money stays in sync everywhere, and every app updates itself.</p>
      <ul className="mt-8 space-y-3">
        <Row
          icon={Smartphone}
          title="Android"
          text={`Version ${NATIVE_RELEASES.android.latest}. Fingerprint lock, reminders and offline screen.`}
          action={NATIVE_RELEASES.android.url ? <Button asChild><a href={NATIVE_RELEASES.android.url}>{NATIVE_RELEASES.android.url.endsWith(".apk") ? "Download for Android" : "Get it on Google Play"}</a></Button> : null}
        />
        <Row
          icon={Apple}
          title="iPhone"
          text={
            NATIVE_RELEASES.ios.url ? (
              `Version ${NATIVE_RELEASES.ios.latest}. Face ID lock, reminders and more.`
            ) : (
              <>The App Store version is on its way. Until then: open this site in Safari, tap <b className="text-foreground">Share</b> → <b className="text-foreground">Add to Home Screen</b>, and turn on Face ID sign-in in Settings.</>
            )
          }
          action={NATIVE_RELEASES.ios.url ? <Button asChild><a href={NATIVE_RELEASES.ios.url}>Download on the App Store</a></Button> : null}
        />
        <Row
          icon={Monitor}
          title="Windows and Mac"
          text={
            DESKTOP_URL ? (
              <>Version {NATIVE_RELEASES.desktop.latest}. Windows: download the <b className="text-foreground">-setup.exe</b> file. Mac: download the <b className="text-foreground">.dmg</b> file.</>
            ) : (
              <>Desktop installers are coming soon. Meanwhile, open this site in Chrome or Edge and choose <b className="text-foreground">Install app</b> from the address bar.</>
            )
          }
          action={DESKTOP_URL ? <Button asChild><a href={DESKTOP_URL}>Download for desktop</a></Button> : null}
        />
        <Row
          icon={Globe}
          title="Any browser"
          text="Works in Chrome, Edge, Safari and Firefox on any device. Nothing to install."
          action={<Button variant="secondary" asChild><Link href="/login">Open in browser</Link></Button>}
        />
      </ul>
    </div>
  );
}
