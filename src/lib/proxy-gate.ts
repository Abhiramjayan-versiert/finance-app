import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isBackendConfigured } from "@/lib/env";

const PUBLIC_PREFIXES = ["/", "/login", "/register", "/verify", "/forgot-password", "/reset-password", "/terms", "/privacy", "/tools", "/offline", "/maintenance", "/suspended", "/api/health", "/api/cron", "/api/test", "/setup"];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));
}

/**
 * Coarse routing only: requests without a session cookie are sent to /login.
 * The cookie itself is cryptographically verified (with revocation checks)
 * on the server by requireWorkspace()/actionWorkspace() for every protected
 * render, action and API call.
 */
export function gate(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const redirect = (path: string, params?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return NextResponse.redirect(url);
  };
  if (!isBackendConfigured()) return isPublic(pathname) ? NextResponse.next() : redirect("/setup");
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasSession) {
    if (isPublic(pathname)) return NextResponse.next();
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return redirect("/login", { next: pathname });
  }
  return NextResponse.next();
}
