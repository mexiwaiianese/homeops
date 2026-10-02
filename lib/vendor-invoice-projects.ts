import type { SupabaseClient } from "@supabase/supabase-js";
import { listDemoOpportunitiesForVendor } from "@/lib/vendor-auction-demo";
import type { VendorSubscriber } from "@/lib/vendor-billing-demo";
import { vendors as demoVendors } from "@/lib/vendor-demo";
import { listDemoJobsForVendor } from "@/lib/vendor-job-demo";

/** A bid or job already on the platform that an invoice can be written against. */
export type InvoiceProject = {
  key: string;
  kind: "bid" | "job";
  label: string;
  detail: string;
  billToName: string | null;
  billToEmail: string | null;
  amountCents: number | null;
  description: string | null;
};

export type PlatformMatch = { id: string; name: string; matchedBy: "name" | "email" | "account" };

function norm(value: string | null | undefined) {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Every time the invoice screen opens, check whether the company name or the email on the
 * self-serve account already exists as a vendor a property manager set up. Matches feed the
 * project dropdown so the invoice can point at a real bid or job.
 */
export function matchDemoVendors(company: VendorSubscriber): PlatformMatch[] {
  const name = norm(company.companyName);
  const email = norm(company.email);
  const matches: PlatformMatch[] = [];
  for (const vendor of demoVendors) {
    if (vendor.id === company.id) matches.push({ id: vendor.id, name: vendor.name, matchedBy: "account" });
    else if (name && norm(vendor.name) === name) matches.push({ id: vendor.id, name: vendor.name, matchedBy: "name" });
    else if (email && norm(vendor.email) === email) matches.push({ id: vendor.id, name: vendor.name, matchedBy: "email" });
  }
  return matches;
}

const DEMO_MANAGER = { billToName: "HomeOps Demo Management", billToEmail: "manager@homeops.example" };

export function demoInvoiceProjects(company: VendorSubscriber) {
  const matches = matchDemoVendors(company);
  const projects: InvoiceProject[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    for (const bid of listDemoOpportunitiesForVendor(match.id)) {
      if (!bid || seen.has(`bid:${bid.id}`)) continue;
      seen.add(`bid:${bid.id}`);
      projects.push({
        key: `bid:${bid.id}`,
        kind: "bid",
        label: [bid.title, bid.address].filter(Boolean).join(" · "),
        detail: bid.status === "awarded" ? "Awarded bid" : bid.ownBidCents != null ? "Your bid is in" : "Open bid",
        ...DEMO_MANAGER,
        amountCents: bid.ownBidCents ?? null,
        description: bid.title || null,
      });
    }
    for (const job of listDemoJobsForVendor(match.id)) {
      if (seen.has(`job:${job.id}`)) continue;
      seen.add(`job:${job.id}`);
      projects.push({
        key: `job:${job.id}`,
        kind: "job",
        label: [job.title, job.address].filter(Boolean).join(" · "),
        detail: job.completedAt ? "Completed job" : job.arrivedAt ? "Job in progress" : "Assigned job",
        ...DEMO_MANAGER,
        amountCents: null,
        description: job.title || null,
      });
    }
  }
  return { matches, projects };
}

export async function liveInvoiceProjects(admin: SupabaseClient, company: VendorSubscriber, vendorId: string) {
  const name = company.companyName.trim();
  const email = company.email.trim().toLowerCase();
  const filters = [`id.eq.${vendorId}`];
  if (name) filters.push(`name.ilike.${name.replace(/[,()]/g, " ")}`);
  if (email) filters.push(`email.ilike.${email}`);
  const found = await admin.from("vendors").select("id, name, email, organization_id, organizations(name)").or(filters.join(","));
  const rows = (found.data ?? []) as Array<{ id: string; name: string; email: string | null; organization_id: string; organizations: { name: string } | { name: string }[] | null }>;
  const orgName = (row: (typeof rows)[number]) => (Array.isArray(row.organizations) ? row.organizations[0]?.name : row.organizations?.name) || null;
  const matches: PlatformMatch[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    matchedBy: row.id === vendorId ? "account" : norm(row.name) === norm(name) ? "name" : "email",
  }));
  const ids = matches.map((row) => row.id);
  if (!ids.length) return { matches, projects: [] as InvoiceProject[] };
  const orgByVendor = new Map(rows.map((row) => [row.id, { orgName: orgName(row) }]));

  const [invites, sites] = await Promise.all([
    admin.from("vendor_bid_invites").select("vendor_id, vendor_bid_opportunities(id, title, address1, status, awarded_vendor_id)").in("vendor_id", ids),
    admin.from("vendor_job_sites").select("id, vendor_id, completed_at, arrived_at, maintenance_requests(title, homes(address1))").in("vendor_id", ids).order("awarded_at", { ascending: false }),
  ]);

  // The manager's email is not stored on the organization, so only the name is prefilled.
  const billTo = (vendor: string) => ({ billToName: orgByVendor.get(vendor)?.orgName || null, billToEmail: null });

  const projects: InvoiceProject[] = [];
  const seen = new Set<string>();
  for (const invite of (invites.data ?? []) as Array<{ vendor_id: string; vendor_bid_opportunities: any }>) {
    const opp = Array.isArray(invite.vendor_bid_opportunities) ? invite.vendor_bid_opportunities[0] : invite.vendor_bid_opportunities;
    if (!opp || seen.has(`bid:${opp.id}`)) continue;
    if (opp.status !== "open" && opp.awarded_vendor_id !== invite.vendor_id) continue;
    seen.add(`bid:${opp.id}`);
    projects.push({
      key: `bid:${opp.id}`,
      kind: "bid",
      label: [opp.title, opp.address1].filter(Boolean).join(" · "),
      detail: opp.status === "awarded" ? "Awarded bid" : "Open bid",
      ...billTo(invite.vendor_id),
      amountCents: null,
      description: opp.title || null,
    });
  }
  for (const site of (sites.data ?? []) as Array<{ id: string; vendor_id: string; completed_at: string | null; arrived_at: string | null; maintenance_requests: any }>) {
    const req = Array.isArray(site.maintenance_requests) ? site.maintenance_requests[0] : site.maintenance_requests;
    const home = Array.isArray(req?.homes) ? req.homes[0] : req?.homes;
    if (seen.has(`job:${site.id}`)) continue;
    seen.add(`job:${site.id}`);
    projects.push({
      key: `job:${site.id}`,
      kind: "job",
      label: [req?.title, home?.address1].filter(Boolean).join(" · ") || "Job",
      detail: site.completed_at ? "Completed job" : site.arrived_at ? "Job in progress" : "Assigned job",
      ...billTo(site.vendor_id),
      amountCents: null,
      description: req?.title || null,
    });
  }
  return { matches, projects };
}
