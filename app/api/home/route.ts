import { NextResponse } from "next/server";
import { PUBLIC_HOME, resolveHomeDestination } from "@/lib/home-destination";

export const dynamic = "force-dynamic";

/** Where the logo should take this browser: the public homepage, or the signed-in persona's desk. */
export async function GET() {
  let href = PUBLIC_HOME;
  try {
    href = await resolveHomeDestination();
  } catch {
    href = PUBLIC_HOME;
  }
  return NextResponse.json({ href }, { headers: { "Cache-Control": "no-store" } });
}
