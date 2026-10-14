import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvoiceAd } from "@/lib/invoice-ads";

export type PlatformSource = { url: string; title: string; evidence: string };
export type DiscoveryStatus = "pending" | "found" | "no_match" | "unavailable" | "failed";
export type PersonalizedInvoiceAd = InvoiceAd & { provider: string; pdfSummary: string };
export type RecipientPlatformProfile = {
  clientId: string | null;
  vendorId: string;
  email: string;
  provider: string | null;
  confidence: string | null;
  evidence: string | null;
  sources: PlatformSource[];
  status: DiscoveryStatus;
  searchedAt: string | null;
  nextSearchAt: string | null;
  ad: PersonalizedInvoiceAd | null;
  offerToken: string;
};

type DiscoveryAnswer = {
  provider: string | null;
  confidence: "high" | "medium" | "low";
  evidence: string;
  sources: PlatformSource[];
};

const memoryProfiles: Map<string, RecipientPlatformProfile> =
  ((globalThis as typeof globalThis & { __invoiceRecipientProfiles?: Map<string, RecipientPlatformProfile> }).__invoiceRecipientProfiles ??= new Map());

const CONSUMER_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com", "proton.me", "protonmail.com",
]);

function profileKey(vendorId: string, email: string) {
  return `${vendorId}:${email.trim().toLowerCase()}`;
}

function inThreeMonths() {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + 3);
  return date.toISOString();
}

function cleanProvider(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 80) || null;
}

function safeSources(value: unknown): PlatformSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const url = String(row.url || "").trim();
    if (!/^https:\/\//i.test(url)) return [];
    return [{
      url: url.slice(0, 1000),
      title: String(row.title || "").replace(/\s+/g, " ").trim().slice(0, 200),
      evidence: String(row.evidence || "").replace(/\s+/g, " ").trim().slice(0, 500),
    }];
  }).slice(0, 5);
}

function parseJsonAnswer(raw: string): DiscoveryAnswer | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const provider = cleanProvider(parsed.provider);
    const confidence = ["high", "medium", "low"].includes(String(parsed.confidence))
      ? String(parsed.confidence) as DiscoveryAnswer["confidence"]
      : "low";
    return {
      provider,
      confidence,
      evidence: String(parsed.evidence || "").replace(/\s+/g, " ").trim().slice(0, 1000),
      sources: safeSources(parsed.sources),
    };
  } catch {
    return null;
  }
}

function queryFor(name: string, email: string) {
  const domain = email.split("@")[1]?.toLowerCase() || "";
  const domainHint = domain && !CONSUMER_DOMAINS.has(domain) ? ` Corporate domain: ${domain}.` : "";
  return [
    `Determine which property-management software platform "${name}" currently uses.${domainHint}`,
    "Search public, current sources. Reliable evidence includes the recipient's official site or portal, an official provider case study, a current job posting, procurement record, help page, login page, or integration documentation that explicitly connects this organization to the platform.",
    "Do not infer a provider from generic technology lists, ads, search snippets, an email provider, or an unsupported directory.",
    "Return JSON only with: provider (string or null), confidence (high, medium, or low), evidence (short explanation), and sources (array of {url,title,evidence}).",
    "Use null unless at least one source explicitly supports the connection. Prefer evidence published or updated within the last 24 months. Current means in use now, not merely used historically.",
  ].join("\n");
}

type OpenAISearchBody = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ text?: string; annotations?: Array<{ type?: string; url?: string; title?: string }> }>;
  }>;
};

function openAiSources(body: OpenAISearchBody): PlatformSource[] {
  const cited = (body.output || []).flatMap((item) => (item.content || []).flatMap((content) => content.annotations || [])
    .filter((annotation) => annotation.type === "url_citation")
    .map((annotation) => ({
      url: annotation.url || "",
      title: annotation.title || "",
      evidence: annotation.title || "Cited by OpenAI web search.",
    })));
  return safeSources(cited);
}

function mergeSources(primary: PlatformSource[], extra: PlatformSource[]) {
  const seen = new Set(primary.map((source) => source.url));
  return [...primary, ...extra.filter((source) => !seen.has(source.url))].slice(0, 5);
}

async function searchWithOpenAI(name: string, email: string): Promise<DiscoveryAnswer | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  if (!key || base !== "https://api.openai.com/v1") return null;
  const response = await fetch(`${base}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_SEARCH_MODEL?.trim() || "gpt-5.5",
      instructions: "You are a cautious B2B research analyst. Search before answering. Never guess. Return valid JSON only.",
      tools: [{ type: "web_search", search_context_size: "low" }],
      input: queryFor(name, email),
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`OpenAI web search failed (${response.status}).`);
  const body = await response.json() as OpenAISearchBody;
  const text = body.output_text || body.output?.flatMap((row) => row.content || []).map((row) => row.text || "").join("\n") || "";
  const answer = parseJsonAnswer(text);
  if (!answer) return null;
  return { ...answer, sources: mergeSources(answer.sources, openAiSources(body)) };
}

export function buildPersonalizedInvoiceAd(provider: string, offerPath: string): PersonalizedInvoiceAd {
  const comparison = /buildium/i.test(provider)
    ? "/vs/portonos-vs-buildium"
    : /doorloop/i.test(provider)
      ? "/vs/portonos-vs-doorloop"
      : "/property-management-software";
  const headline = `A simpler operating layer beyond ${provider}.`;
  const pdfSummary = `Using ${provider}? See how portonOS keeps requests, dispatch, vendor work, approvals, and property costs in one operating flow. This private invoice offer includes a first-year platform credit equal to 3 months of access; processing and usage fees are excluded.`;
  return {
    audience: "manager",
    provider,
    eyebrow: `A PRIVATE OFFER FOR ${provider.toUpperCase()} USERS`.slice(0, 60),
    headline,
    html: [
      `<p>Your organization appears to use <strong>${escapeHtml(provider)}</strong>. portonOS is built for small property teams that want maintenance operations and the property financial picture connected without adding another trail of calls and spreadsheets.</p>`,
      "<ul>",
      "<li>Move from request to dispatch, vendor documentation, approval, and invoice in one workflow.</li>",
      "<li>Keep open work visible as an expected property expense before the final bill posts.</li>",
      "<li>Give owners, managers, and vendors focused views of the same underlying record.</li>",
      "</ul>",
      `<p><a href="${comparison}">Review the platform comparison</a>, then use this recipient-only offer.</p>`,
      "<p><strong>Offer:</strong> a first-year platform credit equal to 3 months of access. Payment processing, screening, overages, and other usage fees are not discounted.</p>",
    ].join(""),
    imageUrl: null,
    imageAlt: "",
    ctaLabel: "Claim 3 months of platform access",
    ctaUrl: offerPath,
    pdfSummary,
    updatedAt: new Date().toISOString(),
  };
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function answerIsReliable(answer: DiscoveryAnswer | null): answer is DiscoveryAnswer & { provider: string } {
  if (!answer?.provider || !answer.sources.length || answer.confidence === "low") return false;
  return answer.confidence === "high" || answer.sources.length >= 2;
}

export async function discoverRecipientPlatform(name: string, email: string) {
  const openAiSearchConfigured = Boolean(process.env.OPENAI_API_KEY?.trim())
    && (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "") === "https://api.openai.com/v1";
  if (!openAiSearchConfigured) {
    return { status: "unavailable" as const, answer: null, note: "Set OPENAI_API_KEY with the official OpenAI API endpoint before searching." };
  }
  try {
    const answer = await searchWithOpenAI(name, email);
    if (!answer || !answerIsReliable(answer)) return { status: "no_match" as const, answer, note: "No reliable current provider evidence was found." };
    return { status: "found" as const, answer, note: "" };
  } catch (error) {
    return { status: "failed" as const, answer: null, note: error instanceof Error ? error.message : "Platform search failed." };
  }
}

function fromClientRow(row: any): RecipientPlatformProfile {
  return {
    clientId: row.id || null,
    vendorId: row.vendor_id || "",
    email: row.email || "",
    provider: row.platform_provider || null,
    confidence: row.platform_confidence || null,
    evidence: row.platform_evidence || null,
    sources: safeSources(row.platform_sources),
    status: row.platform_discovery_status || "pending",
    searchedAt: row.platform_searched_at || null,
    nextSearchAt: row.platform_next_search_at || null,
    ad: row.personalized_invoice_ad || null,
    offerToken: row.offer_token || crypto.randomUUID(),
  };
}

export async function getRecipientPlatformProfile(admin: SupabaseClient | null, vendorId: string, email: string) {
  const normalized = email.trim().toLowerCase();
  if (!admin) return memoryProfiles.get(profileKey(vendorId, normalized)) || null;
  const { data } = await admin.from("vendor_self_clients").select("*").eq("vendor_id", vendorId).eq("email", normalized).maybeSingle();
  return data ? fromClientRow(data) : null;
}

export async function saveRecipientPlatformProfile(admin: SupabaseClient | null, input: {
  vendorId: string;
  signupEmail: string;
  name: string;
  email: string;
  status: DiscoveryStatus;
  answer: DiscoveryAnswer | null;
  existingOfferToken?: string | null;
}) {
  const email = input.email.trim().toLowerCase();
  const offerToken = input.existingOfferToken || crypto.randomUUID();
  const provider = answerIsReliable(input.answer) ? input.answer.provider : null;
  const ad = provider ? buildPersonalizedInvoiceAd(provider, `/offer/${offerToken}`) : null;
  const now = new Date().toISOString();
  const profile: RecipientPlatformProfile = {
    clientId: null,
    vendorId: input.vendorId,
    email,
    provider,
    confidence: provider ? input.answer?.confidence || null : null,
    evidence: provider ? input.answer?.evidence || null : null,
    sources: provider ? input.answer?.sources || [] : [],
    status: input.status,
    searchedAt: now,
    nextSearchAt: inThreeMonths(),
    ad,
    offerToken,
  };
  if (!admin) {
    memoryProfiles.set(profileKey(input.vendorId, email), profile);
    return profile;
  }
  const { data, error } = await admin.from("vendor_self_clients").upsert({
    vendor_id: input.vendorId,
    signup_email: input.signupEmail.trim().toLowerCase(),
    name: input.name.trim(),
    email,
    platform_provider: profile.provider,
    platform_confidence: profile.confidence,
    platform_evidence: profile.evidence,
    platform_sources: profile.sources,
    platform_discovery_status: profile.status,
    platform_searched_at: profile.searchedAt,
    platform_next_search_at: profile.nextSearchAt,
    personalized_invoice_ad: profile.ad,
    offer_token: offerToken,
    updated_at: now,
  }, { onConflict: "signup_email,email" }).select("*").single();
  if (error || !data) throw new Error(error?.message || "Could not save recipient platform research.");
  return fromClientRow(data);
}

export async function profileForInvoiceToken(admin: SupabaseClient | null, invoice: { vendorId: string; billToEmail: string }) {
  return getRecipientPlatformProfile(admin, invoice.vendorId, invoice.billToEmail);
}

export async function findInvoiceOffer(admin: SupabaseClient | null, offerToken: string) {
  if (!/^[0-9a-f-]{36}$/i.test(offerToken)) return null;
  if (!admin) return [...memoryProfiles.values()].find((row) => row.offerToken === offerToken && row.ad) || null;
  const { data } = await admin.from("vendor_self_clients").select("*").eq("offer_token", offerToken).maybeSingle();
  if (!data?.personalized_invoice_ad || !data.platform_provider) return null;
  return fromClientRow(data);
}

export async function trackInvoiceOfferEvent(admin: SupabaseClient | null, input: {
  offerToken: string;
  clientId?: string | null;
  invoiceToken?: string | null;
  eventType: "click" | "registration" | "checkout";
  placement?: string | null;
}) {
  if (!admin) return;
  await admin.from("invoice_offer_events").insert({
    offer_token: input.offerToken,
    client_id: input.clientId || null,
    invoice_token: input.invoiceToken || null,
    event_type: input.eventType,
    marketing_source: "vendor_invoice",
    marketing_medium: "invoice",
    marketing_placement: input.placement || null,
  });
}
