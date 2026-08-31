export type VendorWorkflowStage =
  | "candidate"
  | "invited"
  | "application_submitted"
  | "documents_reviewed"
  | "approved"
  | "monitored"
  | "renewal_required"
  | "suspended";

export type VendorApprovalStatus = "preferred" | "approved" | "conditional" | "suspended" | "blocked";

export const vendorStageOrder: VendorWorkflowStage[] = [
  "candidate",
  "invited",
  "application_submitted",
  "documents_reviewed",
  "approved",
  "monitored",
  "renewal_required",
  "suspended",
];

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
