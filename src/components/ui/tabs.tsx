"use client";

import * as React from "react";
import { Tabs as T } from "radix-ui";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn("glass inline-flex h-10 items-center gap-1 overflow-x-auto rounded-full p-1 scrollbar-none max-w-full", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return <T.Trigger className={cn("inline-flex h-8 items-center rounded-full px-2.5 text-[13px] font-medium text-muted sm:px-3.5 transition-colors press data-[state=active]:bg-white/90 data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_3px_rgba(0,0,0,0.12)] dark:data-[state=active]:bg-white/15 hover:text-foreground whitespace-nowrap cursor-pointer", className)} {...props} />;
}
