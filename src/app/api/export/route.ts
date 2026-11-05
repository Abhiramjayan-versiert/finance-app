import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspace } from "@/lib/auth";
import { getSessionUser } from "@/lib/auth";
import { toCsv } from "@/lib/export/csv";
import { toXlsx } from "@/lib/export/xlsx";
import { buildReport, exportAllData, REPORT_TYPES, type ReportType } from "@/server/reports";
import { rateLimit } from "@/lib/security/rate-limit";
import { periodRange } from "@/lib/finance/dates";
import { logServerError } from "@/lib/security/errors";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.emailVerified) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ws = await requireWorkspace();
  if (!(await rateLimit("export", [ws.userId], 60, 300))) return NextResponse.json({ error: "Too many exports. Try again in a few minutes." }, { status: 429 });

  const sp = req.nextUrl.searchParams;
  const report = sp.get("report") ?? "transactions";
  const format = sp.get("format") ?? "csv";
  const headers = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" };
  try {
    if (report === "all") {
      const data = await exportAllData(ws);
      return new NextResponse(JSON.stringify(data, null, 2), { headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="finance-os-export-${ws.today}.json"` } });
    }
    if (!REPORT_TYPES.some((r) => r.value === report)) return NextResponse.json({ error: "Unknown report" }, { status: 400 });
    const def = periodRange("year", ws.today);
    const from = DATE.test(sp.get("from") ?? "") ? sp.get("from")! : def.from;
    const to = DATE.test(sp.get("to") ?? "") ? sp.get("to")! : ws.today;
    const category = /^[0-9a-f-]{36}$/i.test(sp.get("category") ?? "") ? sp.get("category")! : undefined;
    const r = await buildReport(ws, report as ReportType, from <= to ? { from, to } : { from: to, to: from }, category);
    const base = `finance-os-${report}-${from}-to-${to}`;
    if (format === "json") return NextResponse.json(r, { headers });
    if (format === "xlsx") {
      const bytes = toXlsx(r.title, r.columns, r.rows);
      return new NextResponse(Buffer.from(bytes), { headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}.xlsx"` } });
    }
    return new NextResponse(toCsv(r.columns, r.rows, { bom: true }), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` } });
  } catch (e) {
    await logServerError(e, "api/export", ws.userId);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
