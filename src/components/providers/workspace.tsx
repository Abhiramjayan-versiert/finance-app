"use client";

import { createContext, useContext } from "react";
import type { Category, PaymentMethod } from "@/types/database";

export interface WorkspaceCtx {
  userId: string;
  currency: string;
  currencySymbol: string;
  locale: string;
  today: string;
  dateFormat: string;
  defaultPaymentMethod: PaymentMethod;
  incomeCategories: Category[];
  expenseCategories: Category[];
}

const Ctx = createContext<WorkspaceCtx | null>(null);

export function WorkspaceProvider({ value, children }: { value: WorkspaceCtx; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace must be used inside the app shell");
  return v;
}
