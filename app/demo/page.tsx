import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ManagerDesk from "@/components/manager-desk";
import { demoLandingPath, getDemoSession } from "@/lib/demo-access";
import { getOperatorAdmin } from "@/lib/operator-admin";
import { getPersonaLoginConfig } from "@/lib/persona-login/config";
import { personaUnlockCookie, verifyUnlockCookie } from "@/lib/persona-login/gate";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Demo · portonOS",
  robots: { index: false, follow: false },
};

export default async function DemoDeskPage() {
  const session = await getDemoSession();
  if (session && session.role !== "manager") redirect(demoLandingPath(session.role));
  if (session) return <ManagerDesk surface="demo" />;
  const { allowed } = await getOperatorAdmin();
  if (allowed) return <ManagerDesk surface="demo" />;
  const unlocked = verifyUnlockCookie(getPersonaLoginConfig(), (await cookies()).get(personaUnlockCookie)?.value);
  if (unlocked) return <ManagerDesk surface="demo" />;
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production") return <ManagerDesk surface="demo" />;
  redirect("/#demo");
}
