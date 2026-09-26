// Client-safe types and copy for the tenant portal. No secrets, no server imports.

export const tenantPortalPath = "/tenant";
export const tenantLoginPath = "/tenant/login";

export function tenantEnterPath(token: string) {
  return `/tenant/enter/${token}`;
}

export type TenantPublic = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string;
  city: string;
  homeId: string | null;
  mode: "demo" | "live";
};

export type TenantPaymentMethod = {
  id: string;
  type: "card" | "us_bank_account";
  label: string;
  last4: string;
  brand?: string | null;
  bankName?: string | null;
  expMonth?: number | null;
  expYear?: number | null;
  isDefault: boolean;
};

export type TenantRequestStatus =
  | "diagnose"
  | "authorize"
  | "dispatch"
  | "scheduled"
  | "repair"
  | "invoice"
  | "documented";

export type TenantRequest = {
  id: string;
  title: string;
  description: string | null;
  priority: "normal" | "high" | "emergency";
  status: TenantRequestStatus;
  vendorName: string | null;
  openedAt: string;
  updatedAt: string;
  availability?: string | null;
  category?: string | null;
};

export const issueCategories = [
  { id: "plumbing", label: "Plumbing / leak" },
  { id: "hvac", label: "Heating or cooling" },
  { id: "electrical", label: "Electrical" },
  { id: "appliance", label: "Appliance" },
  { id: "doors_locks", label: "Doors, windows, locks" },
  { id: "pests", label: "Pests" },
  { id: "exterior", label: "Yard, roof, exterior" },
  { id: "other", label: "Something else" },
] as const;

export function tenantStatusLabel(status: string) {
  switch (status.toLowerCase()) {
    case "diagnose": return "Received";
    case "authorize": return "Being reviewed";
    case "dispatch": return "Finding a vendor";
    case "scheduled": return "Scheduled";
    case "repair": return "Work in progress";
    case "invoice": return "Wrapping up";
    case "documented": return "Complete";
    default: return status;
  }
}

export function tenantStatusHint(status: string, vendorName?: string | null) {
  switch (status.toLowerCase()) {
    case "diagnose": return "Your manager has your report and is looking at it.";
    case "authorize": return "The repair is being approved and budgeted.";
    case "dispatch": return vendorName ? `${vendorName} is being assigned.` : "An approved vendor is being selected.";
    case "scheduled": return vendorName ? `${vendorName} is scheduled. Watch for a call or text to confirm access.` : "A visit is being scheduled.";
    case "repair": return vendorName ? `${vendorName} is working on it.` : "Work is underway.";
    case "invoice": return "The work is done and paperwork is being finalized.";
    case "documented": return "This request is closed.";
    default: return "";
  }
}

export function loginLinkCopy(input: { organizationName: string; url: string; channel: "email" | "sms"; tenantName?: string | null }) {
  const first = input.tenantName?.split(" ")[0];
  const greeting = first ? `Hi ${first}, ` : "";
  if (input.channel === "sms") {
    return `${greeting}here is your ${input.organizationName} tenant portal link. It works once and expires in 15 minutes: ${input.url}`;
  }
  return [
    `${greeting}use the link below to open your ${input.organizationName} tenant portal.`,
    "",
    input.url,
    "",
    "The link works once and expires in 15 minutes. From the portal you can pay rent, update your payment method, and report maintenance issues.",
    "If you did not request this, you can ignore this message.",
  ].join("\n");
}

export function describePaymentMethod(method: Pick<TenantPaymentMethod, "type" | "brand" | "bankName" | "last4">) {
  if (method.type === "us_bank_account") return `${method.bankName || "Bank account"} ••••${method.last4}`;
  const brand = (method.brand || "card").replace(/^\w/, (c) => c.toUpperCase());
  return `${brand} ••••${method.last4}`;
}
