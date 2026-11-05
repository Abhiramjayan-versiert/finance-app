export type Cell = string | number | null | undefined;

/** RFC 4180 CSV with formula-injection protection for spreadsheet apps. */
export function toCsv(columns: string[], rows: Cell[][], opts: { bom?: boolean } = {}): string {
  const esc = (v: Cell) => {
    if (v === null || v === undefined) return "";
    let s = typeof v === "number" ? String(v) : v;
    // Neutralise values that Excel/Sheets would evaluate as formulas.
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [columns, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  return (opts.bom ? "﻿" : "") + body + "\r\n";
}
