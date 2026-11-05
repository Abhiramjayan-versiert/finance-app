import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <rect width="32" height="32" rx="8" fill="#14171A" />
      <path d="M9 22V10h12" stroke="#B7F34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M9 16h8" stroke="#B7F34A" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="22.5" cy="21.5" r="2.5" fill="#FFFFFF" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span className="text-[15px]">
        FINANCE <span className="text-accent">OS</span>
      </span>
    </Link>
  );
}
