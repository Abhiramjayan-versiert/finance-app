"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker";
import { LiquidGlass } from "@/components/providers/liquid-glass";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      {children}
      <Toaster position="top-center" richColors closeButton theme="system" toastOptions={{ className: "!rounded-2xl" }} />
      <ServiceWorkerRegistrar />
      <LiquidGlass />
    </ThemeProvider>
  );
}
