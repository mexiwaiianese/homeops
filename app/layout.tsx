import type { Metadata } from "next";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import AuthHashNotice from "@/components/auth-hash-notice";
import HeyCatchAnalytics from "@/components/heycatch-analytics";
import JsonLd from "@/components/json-ld";
import { HOME_DESCRIPTION, SITE_ORIGIN } from "@/lib/public-site";
import { organizationLd } from "@/lib/structured-data";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-ui",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: "500",
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: "portonOS",
  description: HOME_DESCRIPTION,
  openGraph: {
    siteName: "portonOS",
    type: "website",
    images: [{ url: "/brand/portonos-lockup.png", alt: "portonOS wordmark" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/portonos-lockup.png"],
  },
  icons: {
    icon: "/brand/portonos-mark.png",
    apple: "/brand/portonos-mark.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${montserrat.variable} ${cormorant.variable}`}>
      <body className={montserrat.className}>
        <JsonLd data={organizationLd()} />
        <HeyCatchAnalytics />
        <AuthHashNotice />
        {children}
      </body>
    </html>
  );
}
