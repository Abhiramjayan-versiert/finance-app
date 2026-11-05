import Link from "next/link";
import { Logo } from "@/components/shared/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <Logo />
      <p className="text-5xl font-semibold text-accent">404</p>
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="text-sm text-muted">The page doesn&apos;t exist or you don&apos;t have access to it.</p>
      <Link href="/dashboard" className="text-sm text-accent">Go to your dashboard</Link>
    </div>
  );
}
