import type { Metadata } from "next";
import { NOINDEX_ROBOTS } from "@/lib/indexing";

export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
};

export default function FinancialsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
