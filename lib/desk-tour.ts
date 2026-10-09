import type { FeatureKey, FeatureMap } from "@/lib/product-features";

export type DeskTourScreen = {
  id: string;
  href: string;
  tab: string;
  title: string;
  body: string;
};

export type DeskAccess = "workspace_owner" | "manager" | "staff" | "property_owner";

type Screen = DeskTourScreen & { feature?: FeatureKey; access: DeskAccess[] };

const MANAGER_ACCESS = ["workspace_owner", "manager", "staff"] as DeskAccess[];
const LEAD_ACCESS = ["workspace_owner", "manager"] as DeskAccess[];

export const DESK_TOUR: Screen[] = [
  {
    id: "today",
    href: "#Today",
    tab: "Today",
    title: "What needs you today",
    body: "This is the operating list: maintenance that needs a decision, rent that came in, and jobs you can dispatch or put out to bid.",
    feature: "operations",
    access: MANAGER_ACCESS,
  },
  {
    id: "homes",
    href: "#Homes",
    tab: "Homes",
    title: "A passport for each door",
    body: "Each home keeps its address, owner, tenant, rent, and access notes. Add a home here when a new door joins the portfolio.",
    feature: "operations",
    access: MANAGER_ACCESS,
  },
  {
    id: "owners",
    href: "#Owners",
    tab: "Owners",
    title: "Owner rules",
    body: "Authority limits, reserves, and the preferred vendor live on the owner. Edit those rules from this list. The owner sees the result in their own portal.",
    feature: "operations",
    access: MANAGER_ACCESS,
  },
  {
    id: "tenants",
    href: "#Tenants",
    tab: "Tenants",
    title: "Who lives there",
    body: "See the tenant, the home, and what they owe. Text or email a passwordless portal link from this list.",
    feature: "operations",
    access: MANAGER_ACCESS,
  },
  {
    id: "maintenance",
    href: "#Maintenance",
    tab: "Maintenance",
    title: "Move the work forward",
    body: "Advance a request, assign a vendor, or open a private bid. The vendor desk only sees work you award or invite them to.",
    feature: "operations",
    access: MANAGER_ACCESS,
  },
  {
    id: "listings",
    href: "/listings",
    tab: "Listings",
    title: "List the vacancy",
    body: "Draft the listing in portonOS, then syndicate it to the rental networks you have connected.",
    feature: "listings",
    access: MANAGER_ACCESS,
  },
  {
    id: "applications",
    href: "/applications",
    tab: "Applications",
    title: "Review applicants",
    body: "Read an application, record the screening decision, and create the tenant when you approve them.",
    feature: "applications",
    access: MANAGER_ACCESS,
  },
  {
    id: "payments",
    href: "/payments",
    tab: "Payments",
    title: "Collect the rent",
    body: "Create a charge, see what was paid, and follow what is still due for the period.",
    feature: "payments",
    access: MANAGER_ACCESS,
  },
  {
    id: "books",
    href: "/financials",
    tab: "Books",
    title: "Cash by door",
    body: "Books keeps the operating history by home, owner, and tenant, including the owner statement.",
    feature: "books",
    access: MANAGER_ACCESS,
  },
  {
    id: "vendors",
    href: "/vendors",
    tab: "Approved Vendors",
    title: "Who can take the work",
    body: "This is your approved list. Prescreened shops from portonOS appear here before you approve them for dispatch.",
    feature: "approved_vendors",
    access: MANAGER_ACCESS,
  },
  {
    id: "billing",
    href: "/billing",
    tab: "Billing",
    title: "The workspace subscription",
    body: "Review the plan and the renewal. Workspace owners and admins manage billing. Staff do not see this screen.",
    access: LEAD_ACCESS,
  },
];

const OWNER_TOUR: Screen[] = [
  {
    id: "scope",
    href: "#owner-scope",
    tab: "Portfolio",
    title: "Choose the period and the doors",
    body: "The period, property, and type filters set the scope. Every number on this page follows that selection.",
    access: ["property_owner"],
  },
  {
    id: "ask",
    href: "#owner-ask",
    tab: "Ask",
    title: "Ask for a number",
    body: "Ask in plain language, such as maintenance per door or months of reserves. Pin a result if you want it to stay on the dashboard.",
    access: ["property_owner"],
  },
  {
    id: "results",
    href: "#owner-results",
    tab: "Results",
    title: "Results and cash",
    body: "Property results, profit and loss, and cash flow to you are the cards on the dashboard. Arrange hides or reorders them.",
    access: ["property_owner"],
  },
  {
    id: "work",
    href: "#owner-work",
    tab: "Maintenance and leases",
    title: "Open work and leases",
    body: "Open maintenance shows what is still in progress. Leases show who is in place and which doors are vacant.",
    access: ["property_owner"],
  },
];

const LABEL: Record<DeskAccess, string> = {
  workspace_owner: "Workspace owner",
  manager: "Property manager",
  staff: "Staff",
  property_owner: "Property owner",
};

export function deskAccess(role?: string | null, persona?: "manager" | "owner"): DeskAccess {
  if (persona === "owner" || role === "property_owner") return "property_owner";
  if (role === "staff" || role === "viewer") return "staff";
  if (role === "owner" || role === "admin") return "workspace_owner";
  return "manager";
}

export function tourForDesk(input: { role?: string | null; persona: "manager" | "owner"; features?: FeatureMap | null; home?: string }) {
  const access = deskAccess(input.role, input.persona);
  const home = input.home || "/app";
  const source = input.persona === "owner" ? OWNER_TOUR : DESK_TOUR;
  const screens = source
    .filter((screen) => screen.access.includes(access))
    .filter((screen) => !screen.feature || input.features?.[screen.feature] !== false)
    .map((screen) => ({
      ...screen,
      href: screen.href.startsWith("#") && input.persona === "manager" ? `${home}${screen.href}` : screen.href,
    }));
  return { access, label: LABEL[access], screens };
}
