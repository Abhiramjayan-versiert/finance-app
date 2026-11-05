"use client";

import * as React from "react";
import { Tabs as T } from "radix-ui";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn("inline-flex h-9 items-center gap-1 overflow-x-auto rounded-md border border-border bg-background-2 p-1 scrollbar-none max-w-full", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return <T.Trigger className={cn("inline-flex h-7 items-center rounded-sm px-3 text-xs font-medium text-muted transition-colors data-[state=active]:bg-card-2 data-[state=active]:text-foreground hover:text-foreground whitespace-nowrap cursor-pointer", className)} {...props} />;
}
