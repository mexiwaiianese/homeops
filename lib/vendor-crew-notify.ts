import { sendVendorEmail, sendVendorSms } from "@/lib/vendor-outreach";

export type CrewLinkDelivery = {
  channel: "email" | "sms" | null;
  sentTo: string | null;
  sent: boolean;
  provider: string;
  error?: string | null;
};

export function crewLinkCopy(input: { vendorName: string; crewName: string; url: string; jobCount: number; channel: "email" | "sms" }) {
  const jobs = input.jobCount === 1 ? "1 job is" : `${input.jobCount} jobs are`;
  const lead = `${input.vendorName} added you to its crew. ${jobs} on your list.`;
  if (input.channel === "sms") {
    return `${lead} Open your jobs: ${input.url} No sign-in. Pick the job you are heading to, then record arrival, photos, and departure.`;
  }
  return [
    `Hi ${input.crewName},`,
    "",
    lead,
    "",
    `Open your jobs: ${input.url}`,
    "",
    "No sign-in is needed. The link shows only the jobs you are on. Pick the job you are heading to next, and the job report opens so you can record arrival, photos, notes, and departure.",
    "Keep this link private. Anyone with it can see your job list.",
  ].join("\n");
}

/**
 * Send a crew member their personal job link by email and text. Tries both channels when both are on
 * file and reports the first one that went through, so the vendor desk can show where it landed.
 */
export async function notifyCrewLink(input: {
  email?: string | null;
  phone?: string | null;
  vendorName: string;
  crewName: string;
  url: string;
  jobCount: number;
}): Promise<CrewLinkDelivery> {
  const deliveries: CrewLinkDelivery[] = [];
  if (input.email) {
    const result = await sendVendorEmail({
      to: input.email,
      subject: `Your ${input.vendorName} job link`,
      text: crewLinkCopy({ ...input, channel: "email" }),
    });
    deliveries.push({ channel: "email", sentTo: input.email, ...result });
  }
  if (input.phone) {
    const result = await sendVendorSms({ to: input.phone, text: crewLinkCopy({ ...input, channel: "sms" }) });
    deliveries.push({ channel: "sms", sentTo: input.phone, ...result });
  }
  if (!deliveries.length) {
    return { channel: null, sentTo: null, sent: false, provider: "unconfigured", error: "No email or phone on file for this crew member" };
  }
  const sent = deliveries.find((row) => row.sent);
  if (sent) return sent;
  const errors = [...new Set(deliveries.map((row) => row.error).filter(Boolean))];
  return { ...deliveries[0], error: errors.join("; ") || "Link was not delivered" };
}

/** Short status line for the vendor desk: "Sent by text to (801) 555-0100" or why it did not go. */
export function crewDeliverySummary(delivery: CrewLinkDelivery | null | undefined) {
  if (!delivery) return null;
  if (delivery.sent) return `Sent by ${delivery.channel === "sms" ? "text" : "email"} to ${delivery.sentTo}`;
  return delivery.error || "Link was not delivered";
}
