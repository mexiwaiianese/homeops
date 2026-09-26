import { appBaseUrl } from "@/lib/vendor-prospects";

export function invitationUrl(token: string, base?: string) {
  const origin = (base || appBaseUrl()).replace(/\/$/, "");
  return `${origin}/vendors/join/${token}`;
}

export function invitationCopy(input: {
  organizationName: string;
  companyName: string;
  url: string;
  channel: "email" | "sms";
}) {
  const intro = `${input.organizationName} invited ${input.companyName} to apply for its internal approved vendor list. This is not a public marketplace listing.`;
  if (input.channel === "sms") {
    return `${intro} Register here: ${input.url} Reply STOP to opt out.`;
  }
  return [
    intro,
    "",
    `Register with this private link: ${input.url}`,
    "",
    "The form collects company and contact details only. Do not upload W-9s, insurance policies, or other sensitive documents on this public page.",
    "If you were not expecting this invitation, ignore it.",
  ].join("\n");
}

export function confirmationCopy(input: {
  organizationName: string;
  companyName: string;
  channel: "email" | "sms";
}) {
  const body = `${input.companyName} is registered with ${input.organizationName}'s approved vendor program. A manager will review the application before dispatch eligibility is granted. Public review scores are not used as operational performance.`;
  return input.channel === "sms" ? body : `${body}\n\nKeep this message for your records.`;
}

type SendResult = { sent: boolean; provider: string; error?: string };

export async function sendVendorEmail(input: { to: string; subject: string; text: string; from?: string }): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = input.from || process.env.VENDOR_OUTREACH_FROM_EMAIL;
  if (!key || !from) return { sent: false, provider: "unconfigured", error: "Email provider is not configured" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text }),
  });
  if (!response.ok) return { sent: false, provider: "resend", error: "Email provider rejected the message" };
  return { sent: true, provider: "resend" };
}

export async function sendVendorSms(input: { to: string; text: string }): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return { sent: false, provider: "unconfigured", error: "SMS provider is not configured" };
  const digits = input.to.replace(/\D/g, "");
  const to = digits.length === 10 ? `+1${digits}` : input.to.startsWith("+") ? input.to : `+${digits}`;
  const body = new URLSearchParams({ To: to, From: from, Body: input.text });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) return { sent: false, provider: "twilio", error: "SMS provider rejected the message" };
  return { sent: true, provider: "twilio" };
}
