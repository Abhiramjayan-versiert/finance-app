import type { NextRequest } from "next/server";
import { gate } from "@/lib/proxy-gate";

export function proxy(request: NextRequest) {
  return gate(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
