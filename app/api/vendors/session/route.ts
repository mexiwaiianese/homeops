import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthedContext } from "@/lib/backend";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { vendors as demoVendors } from "@/lib/vendor-demo";
import { demoVendorSessionCookie } from "@/lib/vendor-job-demo";

export async function GET() {
  const { supabase, user } = await getAuthedContext();
  if (!supabase) {
    const vendorId = (await cookies()).get(demoVendorSessionCookie)?.value;
    const vendor = demoVendors.find((row) => row.id === vendorId);
    if (!vendor) return NextResponse.json({ mode: "demo", vendor: null }, { status: 401 });
    return NextResponse.json({
      mode: "demo",
      vendor: { id: vendor.id, name: vendor.name, trade: vendor.trade, email: vendor.email, city: vendor.city },
    });
  }
  if (!user) return NextResponse.json({ error: "Sign in to open the vendor desk." }, { status: 401 });
  // Vendor desk users are not organization members, so the user-scoped client cannot see vendor_users under RLS.
  const admin = createSupabaseAdminClient() || supabase;
  const { data } = await admin.from("vendor_users").select("*, vendors(id,name,trade,email,city)").eq("auth_user_id", user.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "This login is not linked to a vendor company." }, { status: 403 });
  const company = Array.isArray(data.vendors) ? data.vendors[0] : data.vendors;
  return NextResponse.json({
    mode: "live",
    vendor: { id: data.vendor_id, name: company?.name, trade: company?.trade, email: data.email, city: company?.city, role: data.role },
  });
}

export async function POST(request: Request) {
  const { supabase } = await getAuthedContext();
  const body = await request.json().catch(() => ({}));
  if (!supabase) {
    const vendor = demoVendors.find((row) => row.id === String(body.vendorId || ""));
    if (!vendor) return NextResponse.json({ error: "Choose a vendor company." }, { status: 400 });
    const response = NextResponse.json({
      mode: "demo",
      vendor: { id: vendor.id, name: vendor.name, trade: vendor.trade, email: vendor.email, city: vendor.city },
    });
    response.cookies.set(demoVendorSessionCookie, vendor.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 14 });
    return response;
  }
  return NextResponse.json({ error: "Use the magic-link form to sign in as a vendor." }, { status: 400 });
}

export async function DELETE() {
  const response = NextResponse.json({ signedOut: true });
  response.cookies.set(demoVendorSessionCookie, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
