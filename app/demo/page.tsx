import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ManagerDesk from "@/components/manager-desk";
import { demoLandingPath, getDemoSession } from "@/lib/demo-access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Demo · portonOS",
  robots: { index: false, follow: false },
};

export default async function DemoDeskPage() {
  const session = await getDemoSession();
  if (!session) redirect("/#demo");
  if (session.role !== "manager") redirect(demoLandingPath(session.role));
  return <ManagerDesk surface="demo" />;
}
