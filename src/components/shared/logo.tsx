import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <defs>
        <linearGradient id="fos-logo" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3a3a40" />
          <stop offset="1" stopColor="#0e0e10" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="10" fill="url(#fos-logo)" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="9.5" fill="none" stroke="rgba(255,255,255,0.35)" />
      <path d="M10 22V10h12" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M10 16h8" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="22.5" cy="21.5" r="2.5" fill="#fff" fillOpacity="0.85" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span className="text-[15px]">
        FINANCE <span className="text-muted">OS</span>
      </span>
    </Link>
  );
}
