import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { buildOwnerStatements, intelligenceRows } from "@/lib/books";
import { currentRentPeriod } from "@/lib/rent";
import { booksHomes, booksOwners, listDemoBills, listDemoEntries, syncDemoLedgerFromCharges } from "@/lib/books-demo";
import { listLiveBills, listLiveEntries, syncLiveLedgerFromCharges } from "@/lib/books-live";
import { listDemoCharges } from "@/lib/rent-demo";
import { listLiveCharges } from "@/lib/rent-live";
import { publicCharge } from "@/lib/rent";
import { tenants } from "@/lib/data";
import { vendors } from "@/lib/vendor-demo";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const period = currentRentPeriod();
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase) {
    const homes = booksHomes();
    const owners = booksOwners();
    const charges = listDemoCharges();
    syncDemoLedgerFromCharges(charges);
    const entries = listDemoEntries();
    const bills = listDemoBills();
    return NextResponse.json({
      mode: "demo",
      period,
      homes,
      owners,
      tenants: tenants.map((row) => ({ id: row.id, name: row.name, home: row.home, email: row.email })),
      vendors: vendors.map((row) => ({ id: row.id, name: row.name })),
      entries,
      bills,
      charges: charges.map((row) => publicCharge(row, origin)),
      transactions: intelligenceRows(entries, homes),
      statements: buildOwnerStatements({ owners, homes, entries, periodStart: period.periodStart, periodEnd: period.periodEnd }),
    });
  }
  if (!user || !organizationId) return NextResponse.json({ mode: "auth" }, { status: 401 });
  const [homeRows, ownerRows, tenantRows, vendorRows, bills, charges] = await Promise.all([
    supabase.from("homes").select("id,address1,city,state,property_code,owner_id,reserve_balance_cents").eq("organization_id", organizationId).order("address1"),
    supabase.from("owners").select("id,full_name,email,minimum_reserve_cents,disbursement_day").eq("organization_id", organizationId),
    supabase.from("tenants").select("id,full_name,email").eq("organization_id", organizationId),
    supabase.from("vendors").select("id,name").eq("organization_id", organizationId),
    listLiveBills(supabase, organizationId),
    listLiveCharges(supabase, organizationId),
  ]);
  const err = homeRows.error || ownerRows.error || tenantRows.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  await syncLiveLedgerFromCharges(supabase, organizationId, charges);
  const entries = await listLiveEntries(supabase, organizationId);
  const homes = (homeRows.data ?? []).map((row) => ({
    id: row.id,
    address1: row.address1,
    city: row.city,
    state: row.state,
    ownerId: row.owner_id,
    reserveCents: row.reserve_balance_cents || 0,
    property_code: row.property_code,
  }));
  const owners = (ownerRows.data ?? []).map((row) => ({
    id: row.id,
    name: row.full_name,
    email: row.email,
    reserveCents: row.minimum_reserve_cents || 0,
    disbursementDay: row.disbursement_day || 10,
  }));
  return NextResponse.json({
    mode: "live",
    period,
    homes,
    owners,
    tenants: (tenantRows.data ?? []).map((row) => ({ id: row.id, name: row.full_name, email: row.email })),
    vendors: (vendorRows.data ?? []).map((row) => ({ id: row.id, name: row.name })),
    entries,
    bills,
    charges: charges.map((row) => publicCharge(row, origin)),
    transactions: intelligenceRows(entries, homes),
    statements: buildOwnerStatements({ owners, homes, entries, periodStart: period.periodStart, periodEnd: period.periodEnd }),
  });
}
