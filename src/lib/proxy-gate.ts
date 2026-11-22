import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isBackendConfigured } from "@/lib/env";

const PUBLIC_PREFIXES = ["/", "/login", "/register", "/verify", "/forgot-password", "/reset-password", "/terms", "/privacy", "/delete-account", "/download", "/downloads", "/tools", "/offline", "/maintenance", "/suspended", "/api/health", "/api/version", "/api/cron", "/api/test", "/setup"];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));
}

/**
 * Coarse routing only: requests without a session cookie are sent to /login.
 * The cookie itself is cryptographically verified (with revocation checks)
 * on the server by requireWorkspace()/actionWorkspace() for every protected
 * render, action and API call.
 */
/**
 * Inside the Android app, page loads are fetched by Capacitor's native proxy,
 * which follows HTTP redirects internally: the WebView would show the new page
 * under the OLD address. For those requests, redirect with a tiny HTML page so
 * the WebView itself navigates and the address stays correct.
 */
function isAppDocumentRequest(request: NextRequest) {
  const ua = request.headers.get("user-agent") ?? "";
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/html") && (ua.includes("FinanceOSApp") || ua.startsWith("Dalvik/"));
}

function htmlRedirect(target: string) {
  const safe = target.replace(/[^A-Za-z0-9/?=&%._~:-]/g, "");
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${safe}"><meta name="viewport" content="width=device-width"><style>html{background:#0b0b0d}</style></head><body><script>location.replace(${JSON.stringify(safe)})</script></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

export function gate(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const appDoc = isAppDocumentRequest(request);
  const redirect = (path: string, params?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return appDoc ? htmlRedirect(url.pathname + url.search) : NextResponse.redirect(url);
  };
  if (!isBackendConfigured()) return isPublic(pathname) ? NextResponse.next() : redirect("/setup");
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasSession) {
    if (isPublic(pathname)) return NextResponse.next();
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return redirect("/login", { next: pathname });
  }
  // Signed in: the home address opens your dashboard (the installed apps start at "/").
  if (pathname === "/") return redirect("/dashboard");
  return NextResponse.next();
}
