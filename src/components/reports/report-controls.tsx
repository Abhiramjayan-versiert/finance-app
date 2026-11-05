"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { FileDown, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { useWorkspace } from "@/components/providers/workspace";

export function ReportControls({ types, report, from, to, category }: { types: ReadonlyArray<{ value: string; label: string }>; report: string; from: string; to: string; category: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const ws = useWorkspace();
  const [pending, start] = useTransition();
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp.toString());
    if (v) n.set(k, v);
    else n.delete(k);
    start(() => router.replace(`${pathname}?${n.toString()}`, { scroll: false }));
  };
  const showCategory = ["transactions", "daily-expenses", "monthly-expenses", "annual-expenses", "income"].includes(report);
  const cats = report === "income" ? ws.incomeCategories : ws.expenseCategories.filter((c) => !c.parent_id);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-busy={pending}>
      <div className="space-y-1 lg:col-span-2"><Label htmlFor="rt" className="text-xs text-muted">Report</Label><NativeSelect id="rt" value={report} onChange={(e) => set("report", e.target.value)}>{types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</NativeSelect></div>
      <div className="space-y-1"><Label htmlFor="rf" className="text-xs text-muted">From</Label><Input id="rf" type="date" defaultValue={from} onChange={(e) => e.target.value && set("from", e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="rto" className="text-xs text-muted">To</Label><Input id="rto" type="date" defaultValue={to} onChange={(e) => e.target.value && set("to", e.target.value)} /></div>
      {showCategory ? (
        <div className="space-y-1"><Label htmlFor="rc" className="text-xs text-muted">Category</Label><NativeSelect id="rc" value={category} onChange={(e) => set("category", e.target.value)}><option value="">All</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></div>
      ) : null}
    </div>
  );
}

export function ExportButtons({ query }: { query: string }) {
  const [busy, setBusy] = useState(false);
  async function pdf() {
    setBusy(true);
    try {
      const res = await fetch(`/api/export?${query}&format=json`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Export failed");
      const r = (await res.json()) as { title: string; subtitle: string; columns: string[]; rows: Array<Array<string | number | null>>; summary: Array<[string, string]> };
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
      const doc = new jsPDF({ orientation: r.columns.length > 6 ? "landscape" : "portrait", unit: "pt" });
      // Standard PDF fonts lack the ₹ glyph, so amounts use ISO currency codes.
      const ascii = (s: string) => s.replace(/₹/g, "INR ").replace(/[^\x20-\x7E]/g, "");
      doc.setFontSize(16);
      doc.text(ascii(`FINANCE OS · ${r.title}`), 40, 48);
      doc.setFontSize(9);
      doc.setTextColor(110);
      doc.text(ascii(r.subtitle), 40, 64);
      autoTable(doc, { startY: 80, head: [["Summary", ""]], body: r.summary.map(([a, b]) => [ascii(a), ascii(b)]), theme: "plain", styles: { fontSize: 9 }, headStyles: { fontStyle: "bold" } });
      autoTable(doc, { head: [r.columns.map(ascii)], body: r.rows.map((row) => row.map((c) => (typeof c === "number" ? c.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : ascii(String(c ?? ""))))), styles: { fontSize: 8 }, headStyles: { fillColor: [27, 31, 35] }, alternateRowStyles: { fillColor: [245, 246, 247] } });
      doc.setFontSize(8);
      doc.text("Generated from your FINANCE OS records. Projections are estimates, not guarantees.", 40, doc.internal.pageSize.getHeight() - 24);
      doc.save(`finance-os-${r.title.toLowerCase().replace(/\W+/g, "-")}.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF export failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" asChild><a href={`/api/export?${query}&format=csv`}><FileDown /> CSV</a></Button>
      <Button variant="secondary" size="sm" asChild><a href={`/api/export?${query}&format=xlsx`}><FileSpreadsheet /> Excel</a></Button>
      <Button variant="secondary" size="sm" onClick={pdf} disabled={busy}><FileText /> {busy ? "Preparing…" : "PDF"}</Button>
    </div>
  );
}
