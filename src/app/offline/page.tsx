import { CloudOff } from "lucide-react";
import { Logo } from "@/components/shared/logo";

export const dynamic = "force-static";

export default function Offline() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo />
      <CloudOff className="size-8 text-warning" />
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-muted">Your financial data is never stored in the offline cache for privacy. Reconnect to load your workspace. Entries you added offline will sync automatically.</p>
      <a href="/dashboard" className="text-sm text-accent">Try again</a>
    </div>
  );
}
