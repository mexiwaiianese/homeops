export type ApplicationStatus = "submitted" | "screening" | "approved" | "denied" | "leased" | "withdrawn";
export type ApplicationFeeStatus = "unpaid" | "paid" | "waived";
export type ScreeningStatus = "not_started" | "requested" | "clear" | "review" | "fail";

export type RentalApplication = {
  id: string;
  listingId: string;
  homeId: string;
  address: string;
  headline: string;
  status: ApplicationStatus;
  fullName: string;
  email: string;
  phone: string | null;
  householdSize: number;
  occupants: string[];
  currentAddress: string | null;
  landlordName: string | null;
  landlordPhone: string | null;
  currentRentCents: number | null;
  reasonForMove: string | null;
  employer: string | null;
  jobTitle: string | null;
  monthlyIncomeCents: number | null;
  employmentLength: string | null;
  pets: string | null;
  vehicles: string | null;
  desiredMoveIn: string | null;
  screeningConsent: boolean;
  feeCents: number;
  feeStatus: ApplicationFeeStatus;
  screeningStatus: ScreeningStatus;
  screeningProvider: string | null;
  screeningNotes: string | null;
  managerNotes: string | null;
  tenantId: string | null;
  leaseId: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export type PublicListing = {
  headline: string;
  address: string;
  city: string;
  rentCents: number;
  depositCents: number;
  availableOn: string | null;
  bedrooms: number;
  bathrooms: number;
  petPolicy: string;
  leaseTerm: string;
  feeCents: number;
  status: string;
};

export const DEFAULT_APPLICATION_FEE_CENTS = 5000;

export function applyPath(token: string) {
  return `/apply/${token}`;
}

export function screeningProviderConfigured() {
  return Boolean(process.env.SCREENING_PROVIDER && process.env.SCREENING_REQUEST_URL);
}

export type ApplicationDraft = {
  fullName: string;
  email: string;
  phone: string | null;
  householdSize: number;
  occupants: string[];
  currentAddress: string | null;
  landlordName: string | null;
  landlordPhone: string | null;
  currentRentCents: number | null;
  reasonForMove: string | null;
  employer: string | null;
  jobTitle: string | null;
  monthlyIncomeCents: number | null;
  employmentLength: string | null;
  pets: string | null;
  vehicles: string | null;
  desiredMoveIn: string | null;
  screeningConsent: boolean;
};

function text(value: unknown, max = 240) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export function parseApplicationDraft(body: Record<string, unknown>): { draft: ApplicationDraft } | { error: string } {
  const fullName = text(body.fullName, 120);
  const email = text(body.email, 160)?.toLowerCase() || null;
  if (!fullName || fullName.length < 2) return { error: "Enter the applicant's full name." };
  if (!email || !email.includes("@")) return { error: "Enter an email address." };
  if (body.screeningConsent !== true) return { error: "Screening consent is required to submit." };
  const household = Math.round(Number(body.householdSize || 1));
  if (!Number.isFinite(household) || household < 1 || household > 20) return { error: "Enter a household size between 1 and 20." };
  const occupants = String(body.occupants || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);
  const income = body.monthlyIncome === "" || body.monthlyIncome == null ? null : Math.round(Number(body.monthlyIncome) * 100);
  const currentRent = body.currentRent === "" || body.currentRent == null ? null : Math.round(Number(body.currentRent) * 100);
  if (income != null && (!Number.isFinite(income) || income < 0)) return { error: "Enter monthly income in dollars." };
  return {
    draft: {
      fullName,
      email,
      phone: text(body.phone, 40),
      householdSize: household,
      occupants,
      currentAddress: text(body.currentAddress, 240),
      landlordName: text(body.landlordName, 120),
      landlordPhone: text(body.landlordPhone, 40),
      currentRentCents: currentRent,
      reasonForMove: text(body.reasonForMove, 500),
      employer: text(body.employer, 160),
      jobTitle: text(body.jobTitle, 120),
      monthlyIncomeCents: income,
      employmentLength: text(body.employmentLength, 80),
      pets: text(body.pets, 240),
      vehicles: text(body.vehicles, 240),
      desiredMoveIn: text(body.desiredMoveIn, 10),
      screeningConsent: true,
    },
  };
}

export function draftToRow(draft: ApplicationDraft) {
  return {
    full_name: draft.fullName,
    email: draft.email,
    phone: draft.phone,
    household_size: draft.householdSize,
    occupants: draft.occupants,
    current_address: draft.currentAddress,
    landlord_name: draft.landlordName,
    landlord_phone: draft.landlordPhone,
    current_rent_cents: draft.currentRentCents,
    reason_for_move: draft.reasonForMove,
    employer: draft.employer,
    job_title: draft.jobTitle,
    monthly_income_cents: draft.monthlyIncomeCents,
    employment_length: draft.employmentLength,
    pets: draft.pets,
    vehicles: draft.vehicles,
    desired_move_in: draft.desiredMoveIn,
    screening_consent: true,
  };
}

export function applicationStatusLabel(status: string) {
  switch (status) {
    case "submitted": return "Submitted";
    case "screening": return "Screening";
    case "approved": return "Approved";
    case "denied": return "Denied";
    case "leased": return "Leased";
    case "withdrawn": return "Withdrawn";
    default: return status;
  }
}
