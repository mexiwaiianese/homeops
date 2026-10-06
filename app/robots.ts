import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/public-site";

export default function robots(): MetadataRoute.Robots {
  const allow = { allow: "/", disallow: ["/admin", "/api", "/app", "/dev"] };
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
