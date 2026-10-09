import { NextResponse } from "next/server";
import { ACCOUNT_TRADES, collectTradeNames, splitTradeNames } from "@/lib/vendor-account";
import { getDemoNotify, setDemoNotify } from "@/lib/vendor-portal-demo";
import { vendors as demoVendors } from "@/lib/vendor-demo";
import { requireVendorActor } from "@/lib/vendor-session";

type AccountRecord = {
  name: string;
  email: string;
  phone: string;
  website: string;
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  emergencyAvailable: boolean;
  trades: string[];
  otherTrades: string;
};

const demoAccounts = new Map<string, AccountRecord>();

function demoAccount(vendorId: string): AccountRecord {
  const saved = demoAccounts.get(vendorId);
  if (saved) return saved;
  const vendor = demoVendors.find((row) => row.id === vendorId);
  const split = splitTradeNames(vendor?.services?.length ? vendor.services : vendor?.trade ? [vendor.trade] : []);
  return {
    name: vendor?.name || "",
    email: vendor?.email || "",
    phone: vendor?.phone || "",
    website: "",
    address1: "",
    city: vendor?.city || "",
    state: vendor?.state || "",
    postalCode: "",
    emergencyAvailable: Boolean(vendor?.emergency_available),
    trades: split.selected,
    otherTrades: split.other.join(", "),
  };
}

function cleanAccount(body: Record<string, unknown>, fallback: AccountRecord): { account: AccountRecord; error?: string } {
  const name = String(body.name ?? fallback.name).trim();
  const email = String(body.email ?? fallback.email).trim();
  const state = String(body.state ?? fallback.state).trim().toUpperCase();
  const trades = Array.isArray(body.trades) ? body.trades.map((row) => String(row)) : fallback.trades;
  const otherTrades = String(body.otherTrades ?? fallback.otherTrades);
  const names = collectTradeNames(trades, otherTrades);
  if (!name) return { account: fallback, error: "Enter the company name." };
  if (email && !email.includes("@")) return { account: fallback, error: "Enter a company email, or leave it blank." };
  if (state && state.length !== 2) return { account: fallback, error: "Use the two-letter state." };
  if (!names.length) return { account: fallback, error: "Choose at least one trade." };
  return {
    account: {
      name,
      email,
      phone: String(body.phone ?? fallback.phone).trim(),
      website: String(body.website ?? fallback.website).trim(),
      address1: String(body.address1 ?? fallback.address1).trim(),
      city: String(body.city ?? fallback.city).trim(),
      state,
      postalCode: String(body.postalCode ?? fallback.postalCode).trim(),
      emergencyAvailable: Boolean(body.emergencyAvailable),
      trades: splitTradeNames(names).selected,
      otherTrades: splitTradeNames(names).other.join(", "),
    },
  };
}

export async function GET() {
  const actor = await requireVendorActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (actor.mode === "demo") {
    return NextResponse.json({
      mode: "demo",
      role: "owner",
      canEdit: true,
      signInEmail: demoAccount(actor.vendorId).email,
      account: demoAccount(actor.vendorId),
      tradeCatalog: ACCOUNT_TRADES,
    });
  }

  const [{ data: vendor }, { data: userRow }, { data: services }, signup] = await Promise.all([
    actor.admin.from("vendors").select("name, email, phone, website, address1, city, state, postal_code, trade, emergency_available").eq("id", actor.vendorId).maybeSingle(),
    actor.admin.from("vendor_users").select("role, email").eq("vendor_id", actor.vendorId).eq("auth_user_id", actor.user.id).maybeSingle(),
    actor.admin.from("vendor_services").select("specialty, service_categories(name)").eq("vendor_id", actor.vendorId).eq("active", true),
    actor.admin.from("vendor_self_signups").select("city, state, trade").eq("vendor_id", actor.vendorId).maybeSingle(),
  ]);
  if (!vendor) return NextResponse.json({ error: "This company record was not found." }, { status: 404 });
  const fromServices = (services ?? []).flatMap((row) => {
    const category = Array.isArray(row.service_categories) ? row.service_categories[0] : row.service_categories;
    return [row.specialty, category?.name].filter((name): name is string => Boolean(name));
  });
  const names = fromServices.length ? fromServices : [vendor.trade, signup.data?.trade].filter((name): name is string => Boolean(name));
  const split = splitTradeNames(names);
  const role = userRow?.role || "owner";
  return NextResponse.json({
    mode: "live",
    role,
    canEdit: role === "owner" || role === "dispatcher",
    signInEmail: actor.user.email || userRow?.email || "",
    account: {
      name: vendor.name || "",
      email: vendor.email || "",
      phone: vendor.phone || "",
      website: vendor.website || "",
      address1: vendor.address1 || "",
      city: vendor.city || signup.data?.city || "",
      state: vendor.state || signup.data?.state || "",
      postalCode: vendor.postal_code || "",
      emergencyAvailable: Boolean(vendor.emergency_available),
      trades: split.selected,
      otherTrades: split.other.join(", "),
    },
    tradeCatalog: ACCOUNT_TRADES,
  });
}

export async function PATCH(request: Request) {
  const actor = await requireVendorActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const body = await request.json().catch(() => ({}));

  if (actor.mode === "demo") {
    const parsed = cleanAccount(body, demoAccount(actor.vendorId));
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    demoAccounts.set(actor.vendorId, parsed.account);
    const names = collectTradeNames(parsed.account.trades, parsed.account.otherTrades);
    const notify = getDemoNotify(actor.vendorId);
    setDemoNotify(actor.vendorId, { ...notify, services: names });
    return GET();
  }

  const { data: userRow } = await actor.admin.from("vendor_users").select("role").eq("vendor_id", actor.vendorId).eq("auth_user_id", actor.user.id).maybeSingle();
  const role = userRow?.role || "owner";
  if (role !== "owner" && role !== "dispatcher") {
    return NextResponse.json({ error: "Only the company owner or a dispatcher can update the company account." }, { status: 403 });
  }

  const current = await GET();
  const currentBody = await current.json();
  if (!current.ok) return NextResponse.json(currentBody, { status: current.status });
  const parsed = cleanAccount(body, currentBody.account);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const names = collectTradeNames(parsed.account.trades, parsed.account.otherTrades);

  const saved = await actor.admin.from("vendors").update({
    name: parsed.account.name,
    email: parsed.account.email || null,
    phone: parsed.account.phone || null,
    website: parsed.account.website || null,
    address1: parsed.account.address1 || null,
    city: parsed.account.city || null,
    state: parsed.account.state || null,
    postal_code: parsed.account.postalCode || null,
    trade: names.join(", "),
    emergency_available: parsed.account.emergencyAvailable,
    updated_at: new Date().toISOString(),
  }).eq("id", actor.vendorId);
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 400 });

  const categories = await actor.admin.from("service_categories").select("id, slug");
  if (!categories.error && categories.data?.length) {
    const categoryId = new Map(categories.data.map((row) => [row.slug, row.id]));
    const general = categoryId.get("general-maintenance") || categories.data[0].id;
    const rows = [
      ...parsed.account.trades.map((slug) => ({
        organization_id: actor.organizationId,
        vendor_id: actor.vendorId,
        service_category_id: categoryId.get(slug) || general,
        specialty: ACCOUNT_TRADES.find((trade) => trade.slug === slug)?.name || slug,
        active: true,
      })),
      ...parsed.account.otherTrades.split(",").map((name) => name.trim()).filter(Boolean).map((specialty) => ({
        organization_id: actor.organizationId,
        vendor_id: actor.vendorId,
        service_category_id: general,
        specialty,
        active: true,
      })),
    ];
    await actor.admin.from("vendor_services").delete().eq("vendor_id", actor.vendorId);
    if (rows.length) {
      const inserted = await actor.admin.from("vendor_services").insert(rows);
      if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 400 });
    }
  }

  await actor.admin.from("vendor_notification_rules").update({
    services: names,
    updated_at: new Date().toISOString(),
  }).eq("vendor_id", actor.vendorId);

  return GET();
}
