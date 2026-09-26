// Persona login: environment-driven configuration. Fail closed.
//
//   PERSONA_LOGIN_ENABLED         unset -> on outside production, off in production.
//                                 "true"/"false" overrides either way.
//   PERSONA_LOGIN_ACCESS_CODE     shared code testers type once (>= 12 chars). Required to enable
//                                 the feature in production unless an email allowlist is set.
//   PERSONA_LOGIN_ALLOWED_EMAILS  comma-separated emails of real signed-in users who may switch
//                                 personas without the code.
//   PERSONA_LOGIN_UNLOCK_DAYS     how long a successful code unlock lasts (default 14).
//   PERSONA_LOGIN_COOKIE_SECRET   optional HMAC key for the unlock cookie. Defaults to a hash of the
//                                 access code + allowlist, so rotating the code invalidates cookies.

export const MIN_ACCESS_CODE_LENGTH = 12;

export type PersonaLoginConfig = {
  enabled: boolean;
  reason: string;
  environment: "development" | "production" | "test";
  accessCode: string | null;
  allowedEmails: string[];
  unlockDays: number;
  cookieSecret: string;
  /** True when a code or allowlist exists; false means the tool is wide open (dev only). */
  requiresUnlock: boolean;
};

const TRUE = new Set(["1", "true", "yes", "on"]);
const FALSE = new Set(["0", "false", "no", "off"]);

function environment(): PersonaLoginConfig["environment"] {
  const env = process.env.NODE_ENV;
  return env === "production" || env === "test" ? env : "development";
}

export function getPersonaLoginConfig(): PersonaLoginConfig {
  const env = environment();
  const raw = (process.env.PERSONA_LOGIN_ENABLED || "").trim().toLowerCase();
  const explicitOn = TRUE.has(raw);
  const explicitOff = FALSE.has(raw);

  const accessCodeRaw = (process.env.PERSONA_LOGIN_ACCESS_CODE || "").trim();
  const accessCode = accessCodeRaw.length ? accessCodeRaw : null;
  const allowedEmails = (process.env.PERSONA_LOGIN_ALLOWED_EMAILS || "")
    .split(/[,\s;]+/)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.includes("@"));
  const unlockDaysRaw = Number(process.env.PERSONA_LOGIN_UNLOCK_DAYS);
  const unlockDays = Number.isFinite(unlockDaysRaw) && unlockDaysRaw > 0 ? Math.min(unlockDaysRaw, 90) : 14;
  const cookieSecret = (process.env.PERSONA_LOGIN_COOKIE_SECRET || "").trim() || `persona-login:${accessCode ?? ""}:${allowedEmails.join(",")}`;
  const requiresUnlock = Boolean(accessCode) || allowedEmails.length > 0;

  const base = { environment: env, accessCode, allowedEmails, unlockDays, cookieSecret, requiresUnlock };

  if (explicitOff) return { ...base, enabled: false, reason: "PERSONA_LOGIN_ENABLED is false." };
  if (env === "production" && !explicitOn) return { ...base, enabled: false, reason: "Persona login is off in production unless PERSONA_LOGIN_ENABLED=true." };
  if (env === "production" && !requiresUnlock) {
    return { ...base, enabled: false, reason: "Production requires PERSONA_LOGIN_ACCESS_CODE or PERSONA_LOGIN_ALLOWED_EMAILS." };
  }
  if (accessCode && accessCode.length < MIN_ACCESS_CODE_LENGTH) {
    return { ...base, enabled: false, reason: `PERSONA_LOGIN_ACCESS_CODE must be at least ${MIN_ACCESS_CODE_LENGTH} characters.` };
  }
  return { ...base, enabled: true, reason: requiresUnlock ? "Enabled for authorized testers." : "Enabled for local development." };
}

/** Cheap check for server components that decide whether to render an entry point at all. */
export function isPersonaLoginEnabled() {
  return getPersonaLoginConfig().enabled;
}
