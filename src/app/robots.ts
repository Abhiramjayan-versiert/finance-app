import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: ["/", "/tools/", "/terms", "/privacy"], disallow: ["/admin", "/api", "/dashboard"] }], sitemap: `${publicEnv.siteUrl}/sitemap.xml` };
}
