export type OrgDispatchSettings = {
  autoAssignAlwaysOn: boolean;
  /** Applicant-pay link. Empty means screening stays a manual result on the application. */
  rentspreeApplicantPayUrl: string;
};

export const DEFAULT_ORG_SETTINGS: OrgDispatchSettings = {
  autoAssignAlwaysOn: false,
  rentspreeApplicantPayUrl: "",
};

/** Demo never opens RentSpree. This host is reserved and does not resolve. */
export const DEMO_APPLICANT_PAY_URL = "https://example.invalid/portonos-demo-applicant-screening";

export const RENTSPREE_PROVIDER = "RentSpree";

export function parseApplicantPayUrl(value: unknown): { url: string } | { error: string } {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return { url: "" };
  if (trimmed.length > 500) return { error: "That URL is too long." };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: "Enter an http or https URL, or leave the field empty." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Enter an http or https URL, or leave the field empty." };
  }
  return { url: parsed.toString() };
}

export function hostIsRentSpree(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
    return host === "rentspree.com" || host.endsWith(".rentspree.com");
  } catch {
    return false;
  }
}

/**
 * Link to show or copy. An empty setting stays manual.
 * Demo substitutes a stand-in so the page never points at RentSpree.
 */
export function applicantPayLink(mode: "demo" | "live", configured: string | null | undefined) {
  const parsed = parseApplicantPayUrl(configured);
  if ("error" in parsed || !parsed.url) return null;
  if (mode === "demo" && hostIsRentSpree(parsed.url)) return DEMO_APPLICANT_PAY_URL;
  return parsed.url;
}

export function parseOrgSettings(value: unknown): OrgDispatchSettings {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const parsedUrl = parseApplicantPayUrl(raw.rentspreeApplicantPayUrl);
  return {
    autoAssignAlwaysOn: raw.autoAssignAlwaysOn === true,
    rentspreeApplicantPayUrl: "url" in parsedUrl ? parsedUrl.url : "",
  };
}

export function orgSettingsPatch(current: unknown, next: Partial<OrgDispatchSettings>) {
  const raw = current && typeof current === "object" && !Array.isArray(current) ? { ...(current as Record<string, unknown>) } : {};
  return {
    ...raw,
    ...parseOrgSettings({ ...raw, ...next }),
  };
}

export function settingsPatchFromBody(body: Record<string, unknown>, mode: "demo" | "live"): { patch: Partial<OrgDispatchSettings> } | { error: string } {
  const patch: Partial<OrgDispatchSettings> = {};
  if ("autoAssignAlwaysOn" in body) patch.autoAssignAlwaysOn = body.autoAssignAlwaysOn === true;
  if ("rentspreeApplicantPayUrl" in body) {
    const parsed = parseApplicantPayUrl(body.rentspreeApplicantPayUrl);
    if ("error" in parsed) return parsed;
    if (mode === "demo" && parsed.url && hostIsRentSpree(parsed.url)) {
      return { error: "Demo mode does not link to RentSpree. Leave the field empty, or use the stand-in URL." };
    }
    patch.rentspreeApplicantPayUrl = parsed.url;
  }
  if (!("autoAssignAlwaysOn" in patch) && !("rentspreeApplicantPayUrl" in patch)) {
    return { error: "No settings to save." };
  }
  return { patch };
}

const demoStore =
  ((globalThis as typeof globalThis & { __homeopsOrgSettings?: OrgDispatchSettings }).__homeopsOrgSettings ??= {
    ...DEFAULT_ORG_SETTINGS,
    rentspreeApplicantPayUrl: DEMO_APPLICANT_PAY_URL,
  });

function ensureDemoPayUrl() {
  if (!Object.prototype.hasOwnProperty.call(demoStore, "rentspreeApplicantPayUrl")) {
    demoStore.rentspreeApplicantPayUrl = DEMO_APPLICANT_PAY_URL;
  }
  if (demoStore.rentspreeApplicantPayUrl && hostIsRentSpree(demoStore.rentspreeApplicantPayUrl)) {
    demoStore.rentspreeApplicantPayUrl = DEMO_APPLICANT_PAY_URL;
  }
}

export function getDemoOrgSettings() {
  ensureDemoPayUrl();
  return parseOrgSettings(demoStore);
}

export function setDemoOrgSettings(next: Partial<OrgDispatchSettings>) {
  ensureDemoPayUrl();
  Object.assign(demoStore, parseOrgSettings({ ...demoStore, ...next }));
  return getDemoOrgSettings();
}

/** Put dispatch settings back to the defaults. Demo screening stays on the stand-in link. */
export function resetDemoOrgSettings() {
  demoStore.autoAssignAlwaysOn = DEFAULT_ORG_SETTINGS.autoAssignAlwaysOn;
  demoStore.rentspreeApplicantPayUrl = DEMO_APPLICANT_PAY_URL;
  return getDemoOrgSettings();
}
