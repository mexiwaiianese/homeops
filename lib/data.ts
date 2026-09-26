export type Health = "good" | "watch" | "urgent";
export type MaintenanceStatus = "Diagnose" | "Authorize" | "Dispatch" | "Scheduled" | "Repair" | "Invoice" | "Documented";

export type PropertyType = "single_family" | "townhome" | "condo" | "duplex" | "multifamily" | "other";

export type Home = {
  id: string;
  address: string;
  city: string;
  ownerId: string;
  tenantId: string;
  type: PropertyType;
  rent: number;
  reserve: number;
  health: Health;
  leaseEnds: string;
  systems: { name: string; detail: string; age: string; next: string }[];
  access: string[];
};

export const owners = [
  { id: "o1", name: "Demo Owner One", email: "owner1@example.com", homes: 2, auth: 350, emergency: 1000, reserve: 500, notifyOver: 500, disbursement: "10th monthly", preferred: "Demo Heating Co." },
  { id: "o2", name: "Demo Owner Two", email: "owner2@example.com", homes: 1, auth: 250, emergency: 750, reserve: 750, notifyOver: 300, disbursement: "15th monthly", preferred: "Demo Home Services" },
  { id: "o3", name: "Demo Owner Three", email: "owner3@example.com", homes: 1, auth: 500, emergency: 1500, reserve: 1000, notifyOver: 750, disbursement: "10th monthly", preferred: "Demo Plumbing Co." },
];

export const tenants = [
  { id: "t1", name: "Demo Tenant One", phone: "(555) 010-0001", email: "tenant1@example.com", home: "100 Demo Lane", balance: 0 },
  { id: "t2", name: "Demo Tenant Two", phone: "(555) 010-0002", email: "tenant2@example.com", home: "200 Sample Avenue", balance: 0 },
  { id: "t3", name: "Demo Tenant Three", phone: "(555) 010-0003", email: "tenant3@example.com", home: "300 Example Court", balance: 2250 },
  { id: "t4", name: "Demo Tenant Four", phone: "(555) 010-0004", email: "tenant4@example.com", home: "400 Preview Road", balance: 0 },
];

export const homes: Home[] = [
  {
    id: "h1", address: "100 Demo Lane", city: "Example City, UT", ownerId: "o1", tenantId: "t1", type: "single_family", rent: 2250, reserve: 750, health: "urgent", leaseEnds: "2027-02-28",
    systems: [
      { name: "HVAC", detail: "Carrier 58STA • installed 2018", age: "8 yrs", next: "Service due now" },
      { name: "Water heater", detail: "Rheem 50 gal • installed 2019", age: "7 yrs", next: "Inspect Oct 2026" },
      { name: "Roof", detail: "Architectural shingle • 2016", age: "10 yrs", next: "Inspect Spring 2027" },
      { name: "Dishwasher", detail: "Whirlpool WDT750SAKZ • 2022", age: "4 yrs", next: "No action" },
    ],
    access: ["Fictional demo access record"],
  },
  {
    id: "h2", address: "200 Sample Avenue", city: "Example City, UT", ownerId: "o1", tenantId: "t2", type: "townhome", rent: 2310, reserve: 615, health: "watch", leaseEnds: "2026-10-18",
    systems: [
      { name: "HVAC", detail: "Lennox ML180 • installed 2020", age: "6 yrs", next: "Service Sep 2026" },
      { name: "Water heater", detail: "AO Smith 50 gal • 2020", age: "6 yrs", next: "Flush Oct 2026" },
      { name: "Sprinklers", detail: "Rain Bird 8-zone", age: "Unknown", next: "Winterize Oct 2026" },
    ],
    access: ["Fictional demo access record"],
  },
  {
    id: "h3", address: "300 Example Court", city: "Example City, UT", ownerId: "o2", tenantId: "t3", type: "condo", rent: 2250, reserve: 800, health: "watch", leaseEnds: "2027-05-31",
    systems: [
      { name: "Water heater", detail: "Bradford White 50 gal • 2013", age: "13 yrs", next: "Replacement recommended" },
      { name: "HVAC", detail: "Trane XR80 • 2017", age: "9 yrs", next: "Service Oct 2026" },
    ],
    access: ["Fictional demo access record"],
  },
  {
    id: "h4", address: "400 Preview Road", city: "Example City, UT", ownerId: "o3", tenantId: "t4", type: "single_family", rent: 2480, reserve: 1150, health: "good", leaseEnds: "2027-01-15",
    systems: [
      { name: "HVAC", detail: "Goodman GM9C96 • 2023", age: "3 yrs", next: "Service Nov 2026" },
      { name: "Water heater", detail: "Rheem Performance • 2022", age: "4 yrs", next: "Flush Nov 2026" },
      { name: "Roof", detail: "Architectural shingle • 2021", age: "5 yrs", next: "No action" },
    ],
    access: ["Fictional demo access record"],
  },
];

export const initialMaintenance = [
  { id: "m1", homeId: "h1", title: "No heat", tenant: "Demo Tenant One", priority: "Emergency", status: "Scheduled" as MaintenanceStatus, estimate: 189, note: "Thermostat is powered. Furnace attempts ignition but stops. Demo Heating Co. scheduled 10–12.", vendorId: "v1", vendorName: "Demo Heating Co." },
  { id: "m2", homeId: "h3", title: "Water heater leaking", tenant: "Demo Tenant Three", priority: "High", status: "Authorize" as MaintenanceStatus, estimate: 1247, note: "Tank is 13 years old. Replacement recommended; owner approval required above $250.", vendorId: null as string | null, vendorName: null as string | null },
  { id: "m3", homeId: "h2", title: "Garbage disposal humming", tenant: "Demo Tenant Two", priority: "Normal", status: "Diagnose" as MaintenanceStatus, estimate: 0, note: "Automated troubleshooting sent to tenant. Awaiting reset-button result.", vendorId: null as string | null, vendorName: null as string | null },
  { id: "m4", homeId: "h4", title: "Drywall patch in hallway", tenant: "Demo Tenant Four", priority: "Normal", status: "Authorize" as MaintenanceStatus, estimate: 275, note: "Tenant damage from moving a dresser. Approve to open a reverse auction, or skip auction and auto-assign.", vendorId: null as string | null, vendorName: null as string | null },
];
