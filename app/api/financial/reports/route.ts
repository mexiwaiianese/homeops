import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { accountantCsv, buildYearReport, nec1099Csv, parseReportYear, scheduleECsv } from "@/lib/books-reports";
import { booksHomes, booksOwners, listDemoEntries, syncDemoLedgerFromCharges } from "@/lib/books-demo";
import { listLiveEntries, syncLiveLedgerFromCharges } from "@/lib/books-live";
import { listDemoCharges } from "@/lib/rent-demo";
import { listLiveCharges } from "@/lib/rent-live";

function csvFile(filename: string, body: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

async function loadReport(year: number) {
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase) {
    const homes = booksHomes();
    const owners = booksOwners();
    syncDemoLedgerFromCharges(listDemoCharges());
    return { mode: "demo" as const, report: buildYearReport({ year, homes, owners, entries: listDemoEntries() }) };
  }
  if (!user || !organizationId) return { mode: "auth" as const, report: null };
  const [homeRows, ownerRows, charges] = await Promise.all([
    supabase.from("homes").select("id,address1,city,state,property_code,owner_id,reserve_balance_cents").eq("organization_id", organizationId).order("address1"),
    supabase.from("owners").select("id,full_name,email,minimum_reserve_cents,disbursement_day").eq("organization_id", organizationId),
    listLiveCharges(supabase, organizationId),
  ]);
  if (homeRows.error || ownerRows.error) throw new Error(homeRows.error?.message || ownerRows.error?.message);
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
  return { mode: "live" as const, report: buildYearReport({ year, homes, owners, entries }) };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const year = parseReportYear(url.searchParams.get("year"));
  const format = (url.searchParams.get("format") || "json").toLowerCase();
  try {
    const loaded = await loadReport(year);
    if (!loaded.report) return NextResponse.json({ mode: "auth" }, { status: 401 });
    if (format === "accountant.csv") return csvFile(`homeops-accountant-${year}.csv`, accountantCsv(loaded.report));
    if (format === "schedule-e.csv") return csvFile(`homeops-schedule-e-${year}.csv`, scheduleECsv(loaded.report));
    if (format === "1099.csv") return csvFile(`homeops-1099-${year}.csv`, nec1099Csv(loaded.report));
    return NextResponse.json({ mode: loaded.mode, report: loaded.report });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not build reports" }, { status: 500 });
  }
}
