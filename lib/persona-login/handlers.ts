// Persona login: generic Next.js route handlers. Mount them in two files:
//
//   app/api/persona-login/route.ts         export const { GET, POST, DELETE } = handlers;
//   app/api/persona-login/unlock/route.ts  export const { POST, DELETE } = handlers.unlock;
//
// Responses
//   GET    /api/persona-login          { status, personas, active }   (404 when the feature is off)
//   POST   /api/persona-login          { personaId } -> { ok, redirectTo, persona }
//   DELETE /api/persona-login          clears every persona session
//   POST   /api/persona-login/unlock   { code } -> sets the unlock cookie, then adapter.onUnlock
//                                      (apps use it to hand the tester a fresh sandbox)
//   DELETE /api/persona-login/unlock   forgets the unlock cookie, then adapter.onLock
//   POST   /api/persona-login/seed     { reset?: boolean } creates demo records (adapter.seed);
//                                      reset=true discards the caller's sandbox first

import { NextResponse } from "next/server";
import { getPersonaLoginConfig } from "./config";
import {
  accessCodeMatches,
  activePersonaId,
  baseCookieOptions,
  clearUnlockCookie,
  clientKey,
  issueUnlockCookie,
  personaActiveCookie,
  personaLoginStatus,
  resetUnlockAttempts,
  resolvePersonaLoginAccess,
  unlockAttemptAllowed,
} from "./gate";
import type { CookieToSet, Persona, PersonaLoginAdapter, PersonaSignInContext } from "./types";

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

function json(body: unknown, init?: { status?: number; cookies?: CookieToSet[] }) {
  const response = NextResponse.json(body, { status: init?.status ?? 200, headers: NO_STORE });
  for (const cookie of init?.cookies ?? []) response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}

function notFound() {
  return json({ error: "Not found" }, { status: 404 });
}

function publicPersona(persona: Persona): Omit<Persona, "meta"> {
  const rest = { ...persona };
  delete rest.meta;
  return rest;
}

function contextFor(request: Request): PersonaSignInContext {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const origin = forwardedHost ? `${forwardedProto || url.protocol.replace(":", "")}://${forwardedHost}` : url.origin;
  return { request, origin };
}

function safeRedirect(path: string | undefined, fallback: string) {
  const candidate = path || fallback;
  return candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : fallback;
}

function log(event: string, details: Record<string, unknown>) {
  console.info(`[persona-login] ${event}`, details);
}

export function createPersonaLoginHandlers(adapter: PersonaLoginAdapter) {
  async function GET() {
    const config = getPersonaLoginConfig();
    if (!config.enabled) return notFound();
    const status = await personaLoginStatus(adapter);
    status.canSeed = typeof adapter.seed === "function";
    if (status.unlocked && adapter.diagnostics) status.warnings = await adapter.diagnostics().catch(() => []);
    // listPersonas may provision the caller's sandbox on first use, so it runs before sandboxLabel.
    const personas = status.unlocked ? (await adapter.listPersonas()).map(publicPersona) : [];
    if (status.unlocked && adapter.sandboxLabel) status.sandbox = await adapter.sandboxLabel().catch(() => null);
    const active = status.unlocked ? await activePersonaId() : null;
    return json({ status, personas, active });
  }

  async function seedPOST(request: Request) {
    const config = getPersonaLoginConfig();
    if (!config.enabled || !adapter.seed) return notFound();
    const access = await resolvePersonaLoginAccess(adapter);
    if (!access.allowed) return json({ error: access.reason, needsUnlock: access.needsUnlock }, { status: 403 });
    const body = (await request.json().catch(() => ({}))) as { reset?: unknown };
    const reset = body.reset === true;
    const result = await adapter.seed({ ...contextFor(request), reset });
    log(result.ok ? (reset ? "reset" : "seed") : reset ? "reset failed" : "seed failed", {
      via: access.via,
      ip: clientKey(request),
      ...(result.ok ? { summary: result.summary } : { error: result.error }),
    });
    if (!result.ok) return json({ error: result.error }, { status: result.status ?? 500 });
    const cookies: CookieToSet[] = [...(result.cookies ?? [])];
    if (reset) cookies.push({ name: personaActiveCookie, value: "", options: baseCookieOptions(0) });
    return json({ ok: true, reset, summary: result.summary }, { cookies });
  }

  async function POST(request: Request) {
    const config = getPersonaLoginConfig();
    if (!config.enabled) return notFound();
    const access = await resolvePersonaLoginAccess(adapter);
    if (!access.allowed) return json({ error: access.reason, needsUnlock: access.needsUnlock }, { status: 403 });

    const body = (await request.json().catch(() => ({}))) as { personaId?: unknown };
    const personaId = typeof body.personaId === "string" ? body.personaId : "";
    const persona = (await adapter.listPersonas()).find((row) => row.id === personaId);
    if (!persona) return json({ error: "Unknown persona." }, { status: 400 });

    const ctx = contextFor(request);
    // signIn replaces the previous persona. Signing out here first revokes the auth session
    // and burns the one-time token the new sign-in is about to verify.
    const result = await adapter.signIn(persona, ctx);
    if (!result.ok) {
      log("sign-in failed", { personaId, via: access.via, ip: clientKey(request), error: result.error });
      return json({ error: result.error }, { status: result.status ?? 400 });
    }

    log("sign-in", { personaId, group: persona.group, via: access.via, ip: clientKey(request) });
    const redirectTo = safeRedirect(result.redirectTo, persona.landingPath);
    const cookies: CookieToSet[] = [
      ...(result.cookies ?? []),
      { name: personaActiveCookie, value: persona.id, options: baseCookieOptions(30 * 24 * 60 * 60) },
    ];
    // Becoming a persona usually replaces the tester's own session, which would drop them off the
    // allowlist. Hand them an unlock cookie so they can keep switching for the unlock window.
    if (access.via === "allowlist") cookies.push(issueUnlockCookie(config));
    return json({ ok: true, redirectTo, persona: publicPersona(persona) }, { cookies });
  }

  async function DELETE(request: Request) {
    const config = getPersonaLoginConfig();
    if (!config.enabled) return notFound();
    const access = await resolvePersonaLoginAccess(adapter);
    if (!access.allowed) return json({ error: access.reason, needsUnlock: access.needsUnlock }, { status: 403 });
    const cleared = (await adapter.signOut?.(contextFor(request)).catch(() => undefined)) ?? [];
    log("sign-out", { via: access.via, ip: clientKey(request) });
    return json({ ok: true }, { cookies: [...cleared, { name: personaActiveCookie, value: "", options: baseCookieOptions(0) }] });
  }

  async function unlockPOST(request: Request) {
    const config = getPersonaLoginConfig();
    if (!config.enabled) return notFound();
    if (!config.accessCode) return json({ error: "No access code is configured for this environment." }, { status: 400 });
    const key = clientKey(request);
    if (!unlockAttemptAllowed(key)) {
      log("unlock rate-limited", { ip: key });
      return json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
    }
    const body = (await request.json().catch(() => ({}))) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code : "";
    if (!accessCodeMatches(config, code)) {
      log("unlock rejected", { ip: key });
      return json({ error: "That access code is not right." }, { status: 401 });
    }
    resetUnlockAttempts(key);
    log("unlock", { ip: key, days: config.unlockDays });
    const cookies: CookieToSet[] = [issueUnlockCookie(config)];
    let summary: string | undefined;
    if (adapter.onUnlock) {
      // A fresh code submission is the tester's "start over" signal. Never fail the unlock itself
      // if the sandbox could not be rebuilt; surface the problem in the panel instead.
      try {
        const hook = await adapter.onUnlock(contextFor(request));
        if (hook?.cookies) cookies.push(...hook.cookies);
        // Whatever persona was active belonged to the old data set.
        cookies.push({ name: personaActiveCookie, value: "", options: baseCookieOptions(0) });
        summary = hook?.summary;
        log("unlock sandbox", { ip: key, summary: summary ?? "(none)" });
      } catch (error) {
        summary = `Unlocked, but the demo sandbox could not be prepared: ${error instanceof Error ? error.message : String(error)}`;
        log("unlock sandbox failed", { ip: key, error: summary });
      }
    }
    return json({ ok: true, unlockDays: config.unlockDays, summary }, { cookies });
  }

  async function unlockDELETE(request: Request) {
    const config = getPersonaLoginConfig();
    if (!config.enabled) return notFound();
    const cleared = (await adapter.onLock?.(contextFor(request)).catch(() => undefined)) ?? [];
    return json({ ok: true }, { cookies: [...cleared, clearUnlockCookie(), { name: personaActiveCookie, value: "", options: baseCookieOptions(0) }] });
  }

  return { GET, POST, DELETE, unlock: { POST: unlockPOST, DELETE: unlockDELETE }, seed: { POST: seedPOST } };
}
