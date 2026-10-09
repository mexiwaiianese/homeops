export type VendorAccess = "owner" | "dispatcher" | "technician";

export type VendorTourScreen = {
  id: string;
  href: string;
  tab: string;
  title: string;
  body: string;
  access: VendorAccess[];
};

/** One screen per vendor tab. A persona only sees the tabs that role can use. */
export const VENDOR_TOUR: VendorTourScreen[] = [
  {
    id: "jobs",
    href: "/vendors/desk",
    tab: "Jobs",
    title: "Jobs and open bids",
    body: "Awarded jobs and the bids a manager has opened for you are on this tab. Open a bid to respond. The crew link on an awarded job needs no login.",
    access: ["owner", "dispatcher"],
  },
  {
    id: "jobs-field",
    href: "/vendors/desk",
    tab: "Jobs",
    title: "Your assigned jobs",
    body: "This tab is the work assigned to you. Open the crew link for the visit, then record arrival, photos, and departure. You do not manage bids, invoices, or the company bank account.",
    access: ["technician"],
  },
  {
    id: "settings",
    href: "/vendors/settings",
    tab: "Bid settings",
    title: "Which jobs can reach you",
    body: "Set the trades, budget, cities, and notice window for notifications. Autobid, when you turn it on, also has to stay inside your floor, ceiling, and an open calendar slot.",
    access: ["owner", "dispatcher"],
  },
  {
    id: "crew",
    href: "/vendors/crew",
    tab: "Crew",
    title: "Send the crew a link",
    body: "Add the people who do the work and send each one a link. They open that link for the visit. They do not need a portonOS account.",
    access: ["owner", "dispatcher"],
  },
  {
    id: "invoices",
    href: "/vendors/invoices",
    tab: "Invoices",
    title: "Bill the client",
    body: "Create an invoice from a job or another project and email the client a link. You can see what was sent and whether it was delivered.",
    access: ["owner", "dispatcher"],
  },
  {
    id: "receivables",
    href: "/vendors/receivables",
    tab: "Receivables",
    title: "What is still owed",
    body: "This tab separates money that is not yet due, invoiced, past due, and paid. Use it to follow up. It does not change the invoice you already sent.",
    access: ["owner", "dispatcher"],
  },
  {
    id: "payouts",
    href: "/vendors/payouts",
    tab: "Bank account",
    title: "Where payments land",
    body: "Connect the company bank account here before clients pay you online. Only the company owner sets this up. Dispatchers and technicians do not see this tab in the tour.",
    access: ["owner"],
  },
];

const ACCESS_LABEL: Record<VendorAccess, string> = {
  owner: "Company owner",
  dispatcher: "Dispatcher",
  technician: "Technician",
};

export function vendorAccess(role?: string | null): VendorAccess {
  if (role === "technician" || role === "dispatcher" || role === "owner") return role;
  return "owner";
}

export function tourForAccess(role?: string | null) {
  const access = vendorAccess(role);
  return {
    access,
    label: ACCESS_LABEL[access],
    screens: VENDOR_TOUR.filter((screen) => screen.access.includes(access)),
  };
}
