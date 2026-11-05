import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv, isSupabaseConfigured } from "@/lib/env";

const PUBLIC_PREFIXES = ["/", "/login", "/register", "/verify", "/forgot-password", "/reset-password", "/auth", "/terms", "/privacy", "/tools", "/offline", "/maintenance", "/suspended", "/api/health", "/api/cron", "/setup"];
const AUTH_PAGES = ["/login", "/register", "/forgot-password"];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));
}

/**
 * Refreshes the Supabase session cookie on every request and enforces the
 * coarse routing rules. Fine-grained authorisation (roles, suspension, RLS)
 * is always re-checked on the server where data is read or written.
 */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isSupabaseConfigured()) {
    if (isPublic(pathname)) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Validates the JWT with Supabase Auth (do not trust getSession() on the server).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirect = (path: string, params?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (!user) {
    if (isPublic(pathname)) return response;
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return redirect("/login", { next: pathname });
  }

  // Unverified accounts may only reach the verification flow.
  if (!user.email_confirmed_at) {
    if (pathname.startsWith("/verify") || pathname.startsWith("/auth") || isPublic(pathname)) return response;
    return redirect("/verify", { email: user.email ?? "" });
  }

  if (AUTH_PAGES.includes(pathname)) return redirect("/dashboard");
  return response;
}
