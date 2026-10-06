import type { MetadataRoute } from "next";
import { INDEXABLE_PATHS, SITE_ORIGIN } from "@/lib/public-site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-10-06");
  return INDEXABLE_PATHS.map((path) => ({
    url: path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`,
    lastModified,
    changeFrequency: path === "/changelog" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path === "/pricing" ? 0.9 : 0.6,
  }));
}
