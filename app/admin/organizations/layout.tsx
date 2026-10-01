import { redirect } from "next/navigation";
import { getOperatorAdmin } from "@/lib/operator-admin";

export const dynamic = "force-dynamic";

export default async function AdminOrganizationsLayout({ children }: { children: React.ReactNode }) {
  const { allowed } = await getOperatorAdmin();
  if (!allowed) redirect("/admin/login");
  return children;
}
