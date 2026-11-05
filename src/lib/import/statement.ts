import { MoneyError, toMinor } from "@/lib/finance/money";

/** RFC 4180-ish CSV parser (quotes, escaped quotes, CRLF, BOM). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((f) => f.trim()));
}

export type DateFormat = "yyyy-mm-dd" | "dd/mm/yyyy" | "mm/dd/yyyy";

export interface ColumnMapping {
  date: number;
  description: number;
  /** Single signed amount column (negative = expense) … */
  amount?: number;
  /** … or separate debit (expense) / credit (income) columns. */
  debit?: number;
  credit?: number;
  dateFormat: DateFormat;
}

export interface StatementRow {
  line: number;
  date: string;
  title: string;
  type: "income" | "expense";
  amountMinor: number;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function parseDate(raw: string, fmt: DateFormat): string | null {
  const v = raw.trim();
  let y: number, m: number, d: number;
  const named = v.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-](\d{2,4})$/); // 05-Nov-2026, 5 Nov 26
  if (named && MONTHS[named[2].toLowerCase()]) {
    d = +named[1];
    m = MONTHS[named[2].toLowerCase()];
    y = +named[3];
  } else {
    const parts = v.split(/[\s/.-]/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.some((n) => !Number.isInteger(n))) return null;
    if (fmt === "yyyy-mm-dd") [y, m, d] = parts;
    else if (fmt === "dd/mm/yyyy") [d, m, y] = parts;
    else [m, d, y] = parts;
  }
  if (y < 100) y += 2000;
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso ? iso : null;
}

function money(raw: string, currency: string): number | null {
  let v = raw.replace(/[₹$€£,\s]/g, "").replace(/^(INR|USD|EUR|GBP|Rs\.?)/i, "");
  let neg = false;
  if (/^\(.*\)$/.test(v)) {
    neg = true;
    v = v.slice(1, -1);
  }
  if (/(?:dr|cr)$/i.test(v)) {
    neg = /dr$/i.test(v);
    v = v.slice(0, -2);
  }
  if (!v) return null;
  try {
    const n = toMinor(v, currency);
    return neg ? -Math.abs(n) : n;
  } catch (e) {
    if (e instanceof MoneyError) {
      // Bank exports sometimes carry more decimals than the currency allows; round half-up.
      const f = Number(v);
      return Number.isFinite(f) ? toMinor(f.toFixed(2), currency) * (neg ? -1 : 1) : null;
    }
    return null;
  }
}

/** Turns raw CSV rows into income/expense rows. Rows that cannot be read are reported, not guessed. */
export function mapStatement(rows: string[][], map: ColumnMapping, currency: string, hasHeader: boolean) {
  const out: StatementRow[] = [];
  const errors: Array<{ line: number; reason: string }> = [];
  rows.forEach((r, idx) => {
    if (hasHeader && idx === 0) return;
    const line = idx + 1;
    const date = parseDate(r[map.date] ?? "", map.dateFormat);
    if (!date) return void errors.push({ line, reason: "Unreadable date" });
    const title = (r[map.description] ?? "").replace(/\s+/g, " ").slice(0, 120) || "Imported transaction";
    let signed: number | null = null;
    if (map.amount !== undefined) signed = money(r[map.amount] ?? "", currency);
    else {
      const debit = map.debit !== undefined ? money(r[map.debit] ?? "", currency) : null;
      const credit = map.credit !== undefined ? money(r[map.credit] ?? "", currency) : null;
      if (debit) signed = -Math.abs(debit);
      else if (credit) signed = Math.abs(credit);
    }
    if (signed === null || signed === 0) return void errors.push({ line, reason: "No amount" });
    out.push({ line, date, title, type: signed < 0 ? "expense" : "income", amountMinor: Math.abs(signed) });
  });
  return { rows: out, errors };
}

/** Best-effort column detection from a header row. */
export function guessMapping(header: string[]): Partial<ColumnMapping> {
  const find = (...words: string[]) => header.findIndex((h) => words.some((w) => h.toLowerCase().includes(w)));
  const debit = find("debit", "withdrawal", "paid out", "dr amount");
  const credit = find("credit", "deposit", "paid in", "cr amount");
  const amount = find("amount", "amt", "value");
  return {
    date: Math.max(0, find("date", "txn date", "value date")),
    description: Math.max(0, find("description", "narration", "particulars", "details", "remarks", "merchant")),
    ...(debit >= 0 && credit >= 0 ? { debit, credit } : amount >= 0 ? { amount } : {}),
  };
}
