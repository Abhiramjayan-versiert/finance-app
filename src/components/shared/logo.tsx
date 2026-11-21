import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    // No gradient ids: the mark renders identically wherever (and however often)
    // it appears, including next to hidden copies. shapeRendering keeps edges crisp.
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7 shrink-0", className)} shapeRendering="geometricPrecision">
      <rect width="32" height="32" rx="10" fill="#1d1d21" />
      <path d="M10 0h12a10 10 0 0 1 10 10v2H0v-2A10 10 0 0 1 10 0z" fill="#fff" fillOpacity="0.07" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="9.5" fill="none" stroke="#fff" strokeOpacity="0.3" />
      <path d="M10 22V10h12" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M10 16h8" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="22.5" cy="21.5" r="2.5" fill="#fff" fillOpacity="0.9" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex min-h-11 items-center gap-2 rounded-lg font-semibold tracking-tight", className)}>
      <LogoMark />
      <span className="whitespace-nowrap text-base">
        FINANCE <span className="text-muted">OS</span>
      </span>
    </Link>
  );
}
