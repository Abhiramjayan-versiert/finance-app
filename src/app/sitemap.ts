import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/tools/calculators", "/register", "/login", "/terms", "/privacy"].map((p) => ({ url: `${publicEnv.siteUrl}${p}`, changeFrequency: "monthly" }));
}
