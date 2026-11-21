import { NextResponse } from "next/server";
import { getSessionUser, requireWorkspace } from "@/lib/auth";
import { getOverview } from "@/server/queries/overview";
import { formatMoney } from "@/lib/finance/money";
import { rateLimit } from "@/lib/security/rate-limit";
import { logServerError } from "@/lib/security/errors";

export const dynamic = "force-dynamic";

/**
 * Upcoming bills, EMIs and expected income for the next 30 days, used by the
 * mobile app to schedule on-device reminder notifications. Only the signed-in
 * user's own data; titles and amounts only.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user || !user.emailVerified) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ws = await requireWorkspace();
  if (!(await rateLimit("reminders", [ws.userId], 60, 300))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  try {
    const o = await getOverview(ws);
    const m = (v: number) => formatMoney(v, ws.settings.currency, { locale: ws.settings.locale });
    const items = o.upcoming.slice(0, 40).map((u) => ({
      key: u.key,
      date: u.date,
      title: u.title,
      amount: m(u.amountMinor),
      kind: u.kind,
      link: u.link,
    }));
    return NextResponse.json({ today: ws.today, items }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (e) {
    await logServerError(e, "/api/reminders", ws.userId);
    return NextResponse.json({ error: "Could not load reminders" }, { status: 500 });
  }
}
