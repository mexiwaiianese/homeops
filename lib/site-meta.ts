import type { Metadata } from "next";
import { SITE_ORIGIN } from "@/lib/public-site";

const PREVIEW = "/brand/portonos-lockup.png";

export function pageMeta(title: string, description: string, path: string): Metadata {
  const url = `${SITE_ORIGIN}${path}`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url,
      siteName: "portonOS",
      type: "website",
      images: [{ url: PREVIEW, alt: "portonOS wordmark" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [PREVIEW],
    },
  };
}
