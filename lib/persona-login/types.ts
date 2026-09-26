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

export type PersonaSeedContext = PersonaSignInContext & {
  /**
   * True when the tester asked for a clean slate (POST <apiBase>/seed with { reset: true }).
   * False means "fill in whatever is missing without touching existing records".
   */
  reset: boolean;
};

export type PersonaSeedResult =
  | { ok: true; summary: string; cookies?: CookieToSet[] }
  | { ok: false; error: string; status?: number };

/** What an app does when a tester proves they hold the access code (or forgets it). */
export type PersonaUnlockHookResult = { cookies?: CookieToSet[]; summary?: string } | void;

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
   * POST <apiBase>/seed and a "Create demo data" button when the persona list is empty, plus a
   * "Reset demo data" action that calls it with `ctx.reset = true`.
   * Without `reset` it must be idempotent (fill gaps, never overwrite); with `reset` it should
   * discard the caller's sandbox and rebuild it. Return a short summary for the UI.
   */
  seed?(ctx: PersonaSeedContext): Promise<PersonaSeedResult>;
  /**
   * Optional: runs after a correct access code is submitted (POST <apiBase>/unlock). This is the
   * place to give the tester a fresh, isolated sandbox. Cookies returned here are set alongside
   * the unlock cookie; `summary` is shown in the panel.
   */
  onUnlock?(ctx: PersonaSignInContext): Promise<PersonaUnlockHookResult>;
  /**
   * Optional: runs when a tester forgets the access code on this browser (DELETE <apiBase>/unlock).
   * Return cookies to clear (e.g. the sandbox pointer) and tear down anything per-browser.
   */
  onLock?(ctx: PersonaSignInContext): Promise<CookieToSet[] | void>;
  /**
   * Optional: one line describing the caller's current sandbox ("Sandbox a1b2c3 · created 2 hours
   * ago"). Shown in the panel footer so testers know which data set they are looking at.
   */
  sandboxLabel?(): Promise<string | null>;
  /**
   * Optional: short human-readable warnings about server configuration that would stop personas
   * from working (missing service key, unreachable database). Shown to unlocked testers.
   */
  diagnostics?(): Promise<string[]>;
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
  /** One-line description of the caller's sandbox from the adapter, when it keeps one per tester. */
  sandbox?: string | null;
  /** Server configuration problems reported by the adapter (only for unlocked callers). */
  warnings?: string[];
  reason?: string;
};
