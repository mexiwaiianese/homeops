import type { Metadata } from "next";
import { pageMeta } from "@/lib/site-meta";

const base = pageMeta(
  "Sign In to Your portonOS Account",
  "Sign in to your portonOS property management workspace with a one-time email link for managers, owners, vendors, and platform admins.",
  "/login",
);

export const metadata: Metadata = {
  ...base,
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
