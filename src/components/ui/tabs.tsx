"use client";

import * as React from "react";
import { Tabs as T } from "radix-ui";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn("inline-flex h-11 items-center gap-1 overflow-x-auto rounded-full bg-card-2 p-1 scrollbar-none max-w-full", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return <T.Trigger className={cn("inline-flex h-9 items-center rounded-full px-3 text-sm font-medium text-muted sm:px-4 transition-colors data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-[var(--shadow-sm)] hover:text-foreground whitespace-nowrap cursor-pointer", className)} {...props} />;
}
