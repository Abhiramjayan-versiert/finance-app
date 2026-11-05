export type TxSearchParams = { q?: string; from?: string; to?: string; type?: string; category?: string; method?: string; page?: string; view?: string };

export function filtersFrom(sp: TxSearchParams) {
  const date = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  const uuid = (s?: string) => (s && /^[0-9a-f-]{36}$/i.test(s) ? s : undefined);
  return {
    search: sp.q?.slice(0, 60),
    from: date(sp.from),
    to: date(sp.to),
    type: sp.type === "income" || sp.type === "expense" ? sp.type : undefined,
    categoryId: uuid(sp.category),
    paymentMethod: ["cash", "upi", "debit_card", "credit_card", "bank_transfer", "other"].includes(sp.method ?? "") ? sp.method : undefined,
  } as const;
}

