// Demo mode (no Supabase): every portal reads the in-memory stores below. They live on
// globalThis for the life of the server process and re-seed themselves lazily, so "reset" means
// emptying each one and letting the next request rebuild the pristine demo data set.
//
// Because the stores are process-wide, demo mode cannot keep two testers apart; that isolation
// exists in live mode where each tester owns a sandbox organization (lib/demo-workspace).

import { listDemoEntries, resetDemoBooks } from "@/lib/books-demo";
import { listDemoListings, resetDemoListings } from "@/lib/listing-demo";
import { listDemoMaintenance, resetDemoMaintenance } from "@/lib/maintenance-demo";
import { resetDemoOrgSettings } from "@/lib/org-settings";
import { resetDemoOwnerPortal } from "@/lib/owner-portal-demo";
import { listDemoCharges, resetDemoRent } from "@/lib/rent-demo";
import { resetDemoTenantPortal } from "@/lib/tenant-demo";
import { resetDemoAuctions } from "@/lib/vendor-auction-demo";
import { listDemoJobsForVendor, resetDemoJobs } from "@/lib/vendor-job-demo";
import { resetDemoOutreach } from "@/lib/vendor-prospect-demo";

/** Empty every in-memory demo store and immediately re-seed so the first page load is not racing lazy seeds. */
export function resetDemoStores() {
  // Order matters: jobs read maintenance, rent posts into books, so clear dependents first.
  resetDemoJobs();
  resetDemoAuctions();
  resetDemoRent();
  resetDemoBooks();
  resetDemoMaintenance();
  resetDemoListings();
  resetDemoOutreach();
  resetDemoTenantPortal();
  resetDemoOwnerPortal();
  resetDemoOrgSettings();

  // Touch each store so the seeds run now, in dependency order (books before rent so rent
  // payments post onto a seeded ledger; maintenance before jobs so the awarded job resolves).
  listDemoEntries();
  listDemoCharges();
  listDemoMaintenance();
  listDemoJobsForVendor("v1");
  listDemoListings();
  return "In-memory demo data reset to the seed on this server.";
}
