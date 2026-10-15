import type { MetadataRoute } from "next";
import { NON_INDEXABLE_ROBOTS_PATHS } from "@/lib/indexing";
import { SITE_ORIGIN } from "@/lib/public-site";

export default function robots(): MetadataRoute.Robots {
  const allow = {
    allow: "/",
    disallow: ["/api", "/app", "/billing", "/login", "/vendors/login", ...NON_INDEXABLE_ROBOTS_PATHS],
  };
  return {
    rules: [
      { userAgent: "*", ...allow },
      { userAgent: "GPTBot", ...allow },
      { userAgent: "ClaudeBot", ...allow },
      { userAgent: "PerplexityBot", ...allow },
      { userAgent: "OAI-SearchBot", ...allow },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
