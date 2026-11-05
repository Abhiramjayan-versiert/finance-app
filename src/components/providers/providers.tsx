"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      {children}
      <Toaster position="top-center" richColors closeButton theme="system" toastOptions={{ className: "!rounded-lg" }} />
      <ServiceWorkerRegistrar />
    </ThemeProvider>
  );
}
