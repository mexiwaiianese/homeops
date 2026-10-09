export type VendorWorkflowStage =
  | "candidate"
  | "invited"
  | "application_submitted"
  | "documents_reviewed"
  | "prescreened"
  | "approved"
  | "monitored"
  | "renewal_required"
  | "suspended";

export type VendorApprovalStatus = "preferred" | "approved" | "conditional" | "suspended" | "blocked";

export const managerVisibleStatuses: VendorApprovalStatus[] = ["preferred", "approved", "conditional"];

export function isNetworkAdmin(role?: string | null) {
  return role === "owner" || role === "admin";
}

/** Stages at which platform admin may flag a catalog vendor for org review. */
export const catalogReleaseStages: VendorWorkflowStage[] = ["documents_reviewed", "prescreened", "approved", "monitored"];

export function canReleaseToOrganizations(stage?: string | null) {
  return catalogReleaseStages.includes(stage as VendorWorkflowStage);
}

export const vendorStageOrder: VendorWorkflowStage[] = [
  "candidate",
  "invited",
  "application_submitted",
  "documents_reviewed",
  "prescreened",
  "approved",
  "monitored",
  "renewal_required",
  "suspended",
];

/** The application path a vendor sees on the vendor desk. */
export const vendorApplicationSteps: Array<{ stage: VendorWorkflowStage; label: string }> = [
  { stage: "candidate", label: "Candidate" },
  { stage: "application_submitted", label: "Application submitted" },
  { stage: "documents_reviewed", label: "Documents reviewed" },
  { stage: "prescreened", label: "Prescreened" },
  { stage: "approved", label: "Approved" },
];

const applicationNext: Record<VendorWorkflowStage, string> = {
  candidate: "portonOS has your company on file. Add your services, license, and insurance in Bid settings so platform admin can review the application.",
  invited: "You were invited to apply. Add your services, license, and insurance in Bid settings so platform admin can review the application.",
  application_submitted: "Your application is in. Platform admin is reviewing your license, insurance, and services.",
  documents_reviewed: "Your documents are reviewed. Platform admin decides next whether to prescreen your company for property managers.",
  prescreened: "Property managers can now see your company as Prescreened. A manager approves you for their properties before they can dispatch work to you.",
  approved: "A property manager approved your company. You can receive and bid on their work.",
  monitored: "You are approved and in good standing. portonOS keeps checking credentials and job performance.",
  renewal_required: "A license or insurance document expired. Upload the renewal so managers can keep sending you work.",
  suspended: "Your company is suspended. Contact portonOS support to find out what is needed to reinstate it.",
};

export function vendorApplicationStatus(stage?: string | null) {
  const current = (vendorStageOrder.includes(stage as VendorWorkflowStage) ? stage : "candidate") as VendorWorkflowStage;
  const pathStage: VendorWorkflowStage = current === "invited" ? "candidate" : current === "monitored" ? "approved" : current;
  const stepIndex = vendorApplicationSteps.findIndex((step) => step.stage === pathStage);
  return {
    stage: current,
    label: current.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    stepIndex,
    prescreened: vendorStageOrder.indexOf(current) >= vendorStageOrder.indexOf("prescreened") && current !== "suspended",
    next: applicationNext[current],
  };
}

export function normalizeVendorName(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(llc|l\.l\.c\.|inc|incorporated|corp|corporation|co|company|pllc|lp|llp)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function buildVendorFingerprint(input: { name: string; phone?: string | null; email?: string | null; postalCode?: string | null }) {
  const normalized = normalizeVendorName(input.name);
  const phone = (input.phone ?? "").replace(/\D/g, "").slice(-10);
  const emailDomain = (input.email ?? "").split("@")[1]?.toLowerCase() ?? "";
  const postal = (input.postalCode ?? "").replace(/\s/g, "").toLowerCase();
  return [normalized, phone, emailDomain, postal].filter(Boolean).join("|");
}

export function credentialBlocksApproval(row: { credential_type: string; verification_status: string; expires_on?: string | null }) {
  const blockingTypes = new Set(["license", "insurance_general_liability", "insurance_workers_comp"]);
  if (!blockingTypes.has(row.credential_type)) return false;
  if (["rejected", "expired"].includes(row.verification_status)) return true;
  return Boolean(row.expires_on && new Date(row.expires_on + "T23:59:59Z").getTime() < Date.now());
}

export type EligibilityResult={eligible:boolean;reasons:string[];signals:string[]};
export function explainVendorEligibility(vendor:any,{homeId,serviceCategoryId}:{homeId?:string|null;serviceCategoryId?:string|null}={}):EligibilityResult{
  const reasons:string[]=[]; const signals:string[]=[];
  if(["blocked","suspended"].includes(vendor.approval_status))reasons.push("Vendor is blocked or suspended");
  if(!["preferred","approved","conditional"].includes(vendor.approval_status))reasons.push("Vendor is not approved for dispatch");
  if((vendor.vendor_credentials??vendor.credentials??[]).some(credentialBlocksApproval))reasons.push("A required credential is expired or rejected");
  if(serviceCategoryId&&!(vendor.vendor_services??[]).some((s:any)=>s.active!==false&&s.service_category_id===serviceCategoryId))reasons.push("Vendor does not offer the requested service");
  const prefs=[...(vendor.vendor_property_preferences??[]).filter((p:any)=>!homeId||p.home_id===homeId),...(vendor.vendor_owner_preferences??[])];
  if(prefs.some((p:any)=>p.preference==="blocked"&&(!p.service_category_id||p.service_category_id===serviceCategoryId)))reasons.push("Vendor is blocked by an owner or property preference");
  if(vendor.approval_status==="preferred")signals.push("Organization preferred");
  if(prefs.some((p:any)=>p.preference==="preferred"))signals.push("Owner/property preferred");
  if(vendor.emergency_available)signals.push("Emergency available");
  return {eligible:reasons.length===0,reasons,signals};
}

export function scorecardSummary(events: Array<{
  response_minutes?: number | null;
  completion_minutes?: number | null;
  quoted_amount_cents?: number | null;
  invoiced_amount_cents?: number | null;
  callback_required?: boolean | null;
  tenant_rating?: number | null;
  manager_rating?: number | null;
  documentation_quality?: number | null;
}>) {
  const avg = (values: number[]) => values.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
  const responses = events.map(e=>e.response_minutes).filter((v):v is number=>v!=null);
  const completions = events.map(e=>e.completion_minutes).filter((v):v is number=>v!=null);
  const costVariance = events
    .filter(e=>e.quoted_amount_cents!=null && e.invoiced_amount_cents!=null && e.quoted_amount_cents!==0)
    .map(e=>(Number(e.invoiced_amount_cents)-Number(e.quoted_amount_cents))/Number(e.quoted_amount_cents));
  const tenant = events.map(e=>e.tenant_rating).filter((v):v is number=>v!=null);
  const manager = events.map(e=>e.manager_rating).filter((v):v is number=>v!=null);
  const docs = events.map(e=>e.documentation_quality).filter((v):v is number=>v!=null);
  const callbacks = events.filter(e=>e.callback_required!=null);
  return {
    sampleSize: events.length,
    objective: {
      avgResponseMinutes: avg(responses),
      avgCompletionMinutes: avg(completions),
      avgCostVariancePct: avg(costVariance)?.valueOf() ?? null,
      callbackRate: callbacks.length ? callbacks.filter(e=>e.callback_required).length/callbacks.length : null,
      samples: { response: responses.length, completion: completions.length, costVariance: costVariance.length, callbacks: callbacks.length },
    },
    subjective: {
      tenantRating: avg(tenant),
      managerRating: avg(manager),
      documentationQuality: avg(docs),
      samples: { tenant: tenant.length, manager: manager.length, documentation: docs.length },
    },
  };
}
