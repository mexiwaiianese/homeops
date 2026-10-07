import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ManagerDesk from "@/components/manager-desk";
import { getAuthedContext } from "@/lib/backend";
import { pageMeta } from "@/lib/site-meta";
import { getDemoSession } from "@/lib/demo-access";
import { blankWorkspaceCookie, memoryWorkspaceById } from "@/lib/provision-org";

export const dynamic = "force-dynamic";

const baseMetadata = pageMeta(
  "portonOS Property Management Workspace",
  "Open your portonOS property management workspace to review homes, maintenance, owner approvals, vendors, rent, and portfolio records.",
  "/app",
);

export const metadata: Metadata = {
  ...baseMetadata,
  robots: { index: false, follow: false },
};

export default async function AppDeskPage() {
  const { organizationId } = await getAuthedContext();
  const blankId = (await cookies()).get(blankWorkspaceCookie)?.value;
  const blank = blankId ? memoryWorkspaceById(blankId) : null;
  if (organizationId || blank) return <ManagerDesk surface="live" />;
  const demo = await getDemoSession();
  if (demo) redirect("/demo");
  redirect("/login");
}
