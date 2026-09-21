import { appBaseUrl } from "@/lib/vendor-prospects";
import { isCalendarConnected, hasOpenCalendarSlot, type CalendarConnection } from "@/lib/vendor-calendar";
import { sendVendorEmail, sendVendorSms } from "@/lib/vendor-outreach";

export type AuctionBid = {
  id: string;
  vendorId: string;
  vendorName?: string;
  amountCents: number;
  source: "manual" | "autobid";
  status: "active" | "withdrawn" | "awarded" | "lost";
  proposedStart?: string | null;
  notes?: string | null;
  submittedAt?: string;
};

export type AutobidRule = {
  enabled: boolean;
  maxAmountCents: number | null;
  minAmountCents: number | null;
  undercutCents: number;
  minNoticeHours: number;
  jobDurationHours: number;
};

export function bidUrl(token: string, base?: string) {
  const origin = (base || appBaseUrl()).replace(/\/$/, "");
  return `${origin}/vendors/bid/${token}`;
}

export function auctionCopy(input: {
  organizationName: string;
  vendorName: string;
  title: string;
  url: string;
  budgetCents?: number | null;
  neededBy?: string | null;
  channel: "email" | "sms";
}) {
  const budget = input.budgetCents != null ? ` Budget: $${Math.round(input.budgetCents / 100)}.` : " No budget cap published.";
  const when = input.neededBy ? ` Needed by ${new Date(input.neededBy).toLocaleString()}.` : "";
  const intro = `${input.organizationName} has an approved job for ${input.vendorName}: ${input.title}.${budget}${when} This is a private reverse auction for eligible approved vendors, not a public listing.`;
  if (input.channel === "sms") return `${intro} Bid here: ${input.url} Reply STOP to opt out.`;
  return [
    intro,
    "",
    `Review and bid with this private link: ${input.url}`,
    "",
    "Do not upload W-9s, insurance, or other sensitive documents on this page.",
    "If you were not expecting this, ignore it.",
  ].join("\n");
}

export function leadingBid(bids: AuctionBid[]) {
  const active = bids.filter((bid) => bid.status === "active");
  if (!active.length) return null;
  return [...active].sort((a, b) => a.amountCents - b.amountCents || a.vendorName?.localeCompare(b.vendorName || "") || 0)[0];
}

export type VendorBidOutcome = "open" | "won" | "lost" | "cancelled" | "expired" | "closed";

export function vendorBidOutcome(status: string, awardedVendorId: string | null | undefined, vendorId: string): VendorBidOutcome {
  if (status === "open") return "open";
  if (status === "awarded") return awardedVendorId === vendorId ? "won" : "lost";
  if (status === "cancelled" || status === "expired") return status;
  return "closed";
}

export function vendorOwnBid(bids: AuctionBid[], vendorId: string) {
  return bids.find((bid) => bid.vendorId === vendorId && bid.status !== "withdrawn") ?? null;
}

export function publishedLeadBid(bids: AuctionBid[], status: string) {
  if (status === "awarded") return bids.find((bid) => bid.status === "awarded") ?? leadingBid(bids);
  return leadingBid(bids);
}

export function participatingBidCount(bids: AuctionBid[], status: string) {
  if (status === "open") return bids.filter((bid) => bid.status === "active").length;
  return bids.filter((bid) => bid.status === "active" || bid.status === "awarded" || bid.status === "lost").length;
}

export function nextAutobidAmount(input: {
  rule: AutobidRule;
  leadingCents: number | null;
  budgetCents?: number | null;
}) {
  if (!input.rule.enabled || input.rule.maxAmountCents == null) return null;
  const ceiling = input.budgetCents != null
    ? Math.min(input.rule.maxAmountCents, input.budgetCents)
    : input.rule.maxAmountCents;
  const floor = Math.max(1, input.rule.minAmountCents ?? 1);
  const undercut = Math.max(100, input.rule.undercutCents || 2500);
  const raw = input.leadingCents == null ? ceiling : input.leadingCents - undercut;
  const amount = Math.min(ceiling, raw);
  if (amount < floor) return null;
  if (input.leadingCents != null && amount >= input.leadingCents) return null;
  return amount;
}

export function autobidBlockReason(input: {
  rule?: AutobidRule | null;
  calendar?: CalendarConnection | null;
  neededBy?: string | null;
}) {
  if (!input.rule?.enabled) return "Autobid is off";
  if (!isCalendarConnected(input.calendar)) return "Service calendar is not connected";
  if (input.neededBy) {
    const noticeMs = (input.rule.minNoticeHours || 0) * 60 * 60 * 1000;
    if (new Date(input.neededBy).getTime() - Date.now() < noticeMs) return "Needed-by is inside the autobid notice window";
    if (!hasOpenCalendarSlot(input.calendar, input.neededBy, input.rule.jobDurationHours)) {
      return "Calendar has no open slot for the manager timeline";
    }
  }
  return null;
}

export async function notifyAuctionInvite(input: {
  email?: string | null;
  phone?: string | null;
  organizationName: string;
  vendorName: string;
  title: string;
  url: string;
  budgetCents?: number | null;
  neededBy?: string | null;
}) {
  const deliveries: Array<{ channel: "email" | "sms"; sentTo: string; sent: boolean; provider: string; error?: string }> = [];
  if (input.email) {
    deliveries.push({
      channel: "email",
      sentTo: input.email,
      ...(await sendVendorEmail({
        to: input.email,
        subject: `Job opportunity from ${input.organizationName}`,
        text: auctionCopy({ ...input, channel: "email" }),
      })),
    });
  }
  if (input.phone) {
    deliveries.push({
      channel: "sms",
      sentTo: input.phone,
      ...(await sendVendorSms({
        to: input.phone,
        text: auctionCopy({ ...input, channel: "sms" }),
      })),
    });
  }
  if (!deliveries.length) {
    return { channel: null, sentTo: null, sent: false, provider: "unconfigured", error: "No vendor email or phone on file" };
  }
  return deliveries.find((row) => row.sent) || deliveries[0];
}
