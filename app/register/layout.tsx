import { pageMeta } from "@/lib/site-meta";

export const metadata = pageMeta(
  "Create your portonOS workspace",
  "Open an empty portonOS workspace. Core is $966 the first year for 25 properties, then $1,188 a year. Operations is $1,788 a year for 75. Portfolio is $3,588 a year for 250. Each property past that is $18 a year, prorated to the renewal date. Billed once a year.",
  "/register",
);

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
