// Persona login: framework-level types. This folder has no app-specific imports so it can be
// copied into another Next.js app as-is. The app supplies a PersonaLoginAdapter.

export type Persona = {
  /** Stable id sent back by the client, e.g. "owner:o1" or "tenant-1". */
  id: string;
  /** Short button label, e.g. "Demo Owner One". */
  label: string;
  /** One-line context shown under the label (address, email, trade). */
  description?: string;
  /** Grouping key such as "manager" | "owner" | "tenant" | "vendor". */
  group: string;
  /** Human heading for the group. Defaults to the capitalized group key. */
  groupLabel?: string;
  /** Where the browser goes after the persona is signed in. */
  landingPath: string;
  /** Small tag on the card, e.g. "demo" or "live". */
  badge?: string;
  /**
   * Adapter-private data (emails, record ids). Stripped before the list is sent to the browser
   * so testers only see labels.
   */
  meta?: Record<string, string>;
};

export type CookieToSet = {
  name: string;
  value: string;
  options?: {
    httpOnly?: boolean;
    sameSite?: "lax" | "strict" | "none";
    secure?: boolean;
    path?: string;
    maxAge?: number;
  };
};

export type PersonaSignInResult =
  | { ok: true; cookies?: CookieToSet[]; redirectTo?: string }
  | { ok: false; error: string; status?: number };

export type PersonaSignInContext = {
  request: Request;
  /** Public origin of the app, derived from the request. Useful for building callback URLs. */
  origin: string;
};

export type PersonaLoginAdapter = {
  /** All personas a tester may become right now. Called on every list/sign-in request. */
  listPersonas(): Promise<Persona[]>;
  /** Establish the persona's session. Return cookies to set, or set them with next/headers cookies(). */
  signIn(persona: Persona, ctx: PersonaSignInContext): Promise<PersonaSignInResult>;
  /**
   * Clear every persona session the app knows about. Called before each sign-in (so switching is
   * clean) and by DELETE. Return cookies to clear; the core also clears its own bookkeeping cookie.
   */
  signOut?(ctx: PersonaSignInContext): Promise<CookieToSet[] | void>;
  /**
   * Email of the currently signed-in real user, if the app has one. Used for
   * PERSONA_LOGIN_ALLOWED_EMAILS so named beta testers never need the shared access code.
   */
  currentUserEmail?(): Promise<string | null>;
  /**
   * Optional: create demo records so personas exist on an empty backend. Exposed as
   * POST <apiBase>/seed and a "Create demo data" button when the persona list is empty.
   * Must be idempotent; return a short summary for the UI.
   */
  seed?(ctx: PersonaSignInContext): Promise<{ ok: true; summary: string } | { ok: false; error: string; status?: number }>;
};

export type PersonaLoginAccess =
  | { allowed: true; via: "open" | "code" | "allowlist" }
  | { allowed: false; enabled: boolean; needsUnlock: boolean; reason: string };

export type PersonaLoginStatus = {
  enabled: boolean;
  unlocked: boolean;
  /** True when a shared access code is configured, so the panel should show the code form. */
  codeAvailable: boolean;
  /** True when an email allowlist is configured (so the panel can hint "or sign in with your beta email"). */
  allowlistAvailable: boolean;
  via: "open" | "code" | "allowlist" | null;
  environment: "development" | "production" | "test";
  /** True when the adapter can create demo records (shows "Create demo data" on an empty list). */
  canSeed?: boolean;
  reason?: string;
};
