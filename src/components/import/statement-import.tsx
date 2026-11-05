"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/providers/workspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, NativeSelect } from "@/components/ui/input";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney } from "@/lib/finance/money";
import { formatDisplayDate } from "@/lib/finance/dates";
import { PAYMENT_METHODS } from "@/lib/labels";
import { guessMapping, mapStatement, parseCsv, type ColumnMapping, type DateFormat } from "@/lib/import/statement";
import { importTransactionsAction } from "@/server/actions/import";

const NONE = -1;

function ColSelect({ id, label, value, onChange, optional, cols }: { id: string; label: string; value: number; onChange: (v: number) => void; optional?: boolean; cols: Array<{ i: number; label: string }> }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted">{label}</Label>
      <NativeSelect id={id} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {optional ? <option value={NONE}>— none —</option> : null}
        {cols.map((c) => <option key={c.i} value={c.i}>{c.label}</option>)}
      </NativeSelect>
    </div>
  );
}

export function StatementImport() {
  const ws = useWorkspace();
  const router = useRouter();
  const [fileName, setFileName] = useState("");
  const [raw, setRaw] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [mode, setMode] = useState<"signed" | "split">("signed");
  const [map, setMap] = useState({ date: 0, description: 1, amount: 2, debit: NONE, credit: NONE });
  const [dateFormat, setDateFormat] = useState<DateFormat>("dd/mm/yyyy");
  const [expenseCat, setExpenseCat] = useState("");
  const [incomeCat, setIncomeCat] = useState("");
  const [method, setMethod] = useState(ws.defaultPaymentMethod as string);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; duplicates: number; failed: number } | null>(null);

  async function onFile(f: File) {
    if (f.size > 5 * 1024 * 1024) return toast.error("Please use a CSV file under 5 MB.");
    const rows = parseCsv(await f.text());
    if (rows.length < 2) return toast.error("That file has no rows we can read. Export your statement as CSV.");
    setFileName(f.name);
    setRaw(rows);
    setResult(null);
    const g = guessMapping(rows[0]);
    if (g.debit !== undefined && g.credit !== undefined) {
      setMode("split");
      setMap({ date: g.date ?? 0, description: g.description ?? 1, amount: NONE, debit: g.debit, credit: g.credit });
    } else {
      setMode("signed");
      setMap({ date: g.date ?? 0, description: g.description ?? 1, amount: g.amount ?? 2, debit: NONE, credit: NONE });
    }
    if (/^\d{4}-/.test(rows[1]?.[g.date ?? 0] ?? "")) setDateFormat("yyyy-mm-dd");
  }

  const mapping: ColumnMapping = mode === "signed" ? { date: map.date, description: map.description, amount: map.amount, dateFormat } : { date: map.date, description: map.description, debit: map.debit === NONE ? undefined : map.debit, credit: map.credit === NONE ? undefined : map.credit, dateFormat };
  const mappingKey = JSON.stringify(mapping);
  const parsed = useMemo(() => (raw.length ? mapStatement(raw, JSON.parse(mappingKey) as ColumnMapping, ws.currency, hasHeader) : null), [raw, mappingKey, ws.currency, hasHeader]);
  const cols = (raw[0] ?? []).map((h, i) => ({ i, label: hasHeader ? h || `Column ${i + 1}` : `Column ${i + 1} (${h.slice(0, 16)})` }));
  const m = (v: number) => formatMoney(v, ws.currency, { locale: ws.locale });
  const totals = parsed ? parsed.rows.reduce((t, r) => ({ ...t, [r.type]: t[r.type] + r.amountMinor }), { income: 0, expense: 0 }) : null;

  async function runImport() {
    if (!parsed?.rows.length) return;
    setBusy(true);
    // Identical rows within the file (e.g. two ₹50 teas on one day) stay distinct via an index.
    const seen = new Map<string, number>();
    const rows = parsed.rows.map((r) => {
      const k = `${r.date}|${r.type}|${r.amountMinor}|${r.title.toLowerCase()}`;
      const n = seen.get(k) ?? 0;
      seen.set(k, n + 1);
      return { date: r.date, title: r.title, type: r.type, amountMinor: r.amountMinor, dupIndex: n };
    });
    const total = { created: 0, duplicates: 0, failed: 0 };
    try {
      for (let i = 0; i < rows.length; i += 200) {
        const res = await importTransactionsAction({ rows: rows.slice(i, i + 200), expenseCategoryId: expenseCat || null, incomeCategoryId: incomeCat || null, paymentMethod: method as never });
        if (!res.ok) throw new Error(res.error);
        total.created += res.data!.created;
        total.duplicates += res.data!.duplicates;
        total.failed += res.data!.failed;
      }
      setResult(total);
      toast.success(`Imported ${total.created} transactions`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><div><CardTitle>1. Choose your statement</CardTitle><CardDescription>Download a CSV from your bank or card app (most Indian banks offer “Download → CSV/Excel”; save Excel files as CSV).</CardDescription></div></CardHeader>
        <CardContent>
          <Button variant="secondary" asChild>
            <label className="cursor-pointer"><FileUp /> {fileName || "Select CSV file"}<input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></label>
          </Button>
          <p className="mt-2 text-xs text-muted">The file is read in your browser; only the parsed rows are sent to your account. Bank login details are never needed.</p>
        </CardContent>
      </Card>

      {raw.length ? (
        <>
          <Card>
            <CardHeader><div><CardTitle>2. Match the columns</CardTitle><CardDescription>We guessed from the headers — adjust if needed.</CardDescription></div></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} className="accent-[var(--accent)]" /> First row is a header</label>
                <label className="flex items-center gap-2"><input type="radio" checked={mode === "signed"} onChange={() => setMode("signed")} className="accent-[var(--accent)]" /> One amount column (negative = spent)</label>
                <label className="flex items-center gap-2"><input type="radio" checked={mode === "split"} onChange={() => setMode("split")} className="accent-[var(--accent)]" /> Separate debit / credit columns</label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <ColSelect cols={cols} id="c-date" label="Date column" value={map.date} onChange={(v) => setMap({ ...map, date: v })} />
                <div className="space-y-1">
                  <Label htmlFor="c-fmt" className="text-xs text-muted">Date format</Label>
                  <NativeSelect id="c-fmt" value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
                    <option value="dd/mm/yyyy">DD/MM/YYYY (India, UK)</option>
                    <option value="mm/dd/yyyy">MM/DD/YYYY (US)</option>
                    <option value="yyyy-mm-dd">YYYY-MM-DD</option>
                  </NativeSelect>
                </div>
                <ColSelect cols={cols} id="c-desc" label="Description column" value={map.description} onChange={(v) => setMap({ ...map, description: v })} />
                {mode === "signed" ? (
                  <ColSelect cols={cols} id="c-amt" label="Amount column" value={map.amount} onChange={(v) => setMap({ ...map, amount: v })} />
                ) : (
                  <>
                    <ColSelect cols={cols} id="c-dr" label="Debit (spent) column" value={map.debit} onChange={(v) => setMap({ ...map, debit: v })} optional />
                    <ColSelect cols={cols} id="c-cr" label="Credit (received) column" value={map.credit} onChange={(v) => setMap({ ...map, credit: v })} optional />
                  </>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="c-ec" className="text-xs text-muted">Category for expenses</Label>
                  <NativeSelect id="c-ec" value={expenseCat} onChange={(e) => setExpenseCat(e.target.value)}>
                    <option value="">Uncategorised (sort later)</option>
                    {ws.expenseCategories.filter((c) => !c.archived && !c.parent_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="c-ic" className="text-xs text-muted">Category for income</Label>
                  <NativeSelect id="c-ic" value={incomeCat} onChange={(e) => setIncomeCat(e.target.value)}>
                    <option value="">Uncategorised</option>
                    {ws.incomeCategories.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="c-pm" className="text-xs text-muted">Payment method</Label>
                  <NativeSelect id="c-pm" value={method} onChange={(e) => setMethod(e.target.value)}>
                    {PAYMENT_METHODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </NativeSelect>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>3. Review and import</CardTitle>
                <CardDescription>
                  {parsed?.rows.length ?? 0} rows ready{totals ? ` · ${m(totals.income)} in · ${m(totals.expense)} out` : ""}
                  {parsed?.errors.length ? ` · ${parsed.errors.length} skipped (unreadable date or amount)` : ""}
                </CardDescription>
              </div>
              <Button onClick={runImport} disabled={busy || !parsed?.rows.length}>{busy ? <><Loader2 className="animate-spin" /> Importing…</> : `Import ${parsed?.rows.length ?? 0} rows`}</Button>
            </CardHeader>
            <CardContent>
              {result ? (
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md bg-success/10 p-3 text-sm">
                  <CheckCircle2 className="size-4 text-success" />
                  <span>{result.created} imported · {result.duplicates} already existed (skipped){result.failed ? ` · ${result.failed} failed` : ""}</span>
                  <Link href="/transactions" className="ml-auto text-accent">View transactions →</Link>
                </div>
              ) : null}
              {parsed?.rows.length ? (
                <Table>
                  <THead><tr><TH>Date</TH><TH>Description</TH><TH>Type</TH><TH className="text-right">Amount</TH></tr></THead>
                  <tbody>
                    {parsed.rows.slice(0, 20).map((r) => (
                      <TR key={r.line}><TD className="whitespace-nowrap">{formatDisplayDate(r.date)}</TD><TD className="max-w-xs truncate">{r.title}</TD><TD className={r.type === "income" ? "text-success" : ""}>{r.type}</TD><TD className="text-right tabular">{m(r.amountMinor)}</TD></TR>
                    ))}
                  </tbody>
                </Table>
              ) : <p className="py-6 text-center text-xs text-muted">No readable rows yet — check the column mapping and date format.</p>}
              {parsed && parsed.rows.length > 20 ? <p className="mt-2 text-xs text-muted">Showing the first 20 of {parsed.rows.length} rows.</p> : null}
              <p className="mt-3 text-[11px] text-muted">Re-importing the same statement is safe: rows that already exist are skipped automatically.</p>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
