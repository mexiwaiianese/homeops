"use client";

// Reusable persona switcher UI. Talks only to the persona-login API, so it can be dropped into any
// app that mounts lib/persona-login handlers. Styles live in persona-login.css (self-contained).

import { useCallback, useEffect, useMemo, useState } from "react";
import "./persona-login.css";

type PublicPersona = {
  id: string;
  label: string;
  description?: string;
  group: string;
  groupLabel?: string;
  landingPath: string;
  badge?: string;
};

type Status = {
  enabled: boolean;
  unlocked: boolean;
  codeAvailable: boolean;
  allowlistAvailable: boolean;
  via: "open" | "code" | "allowlist" | null;
  environment: "development" | "production" | "test";
  canSeed?: boolean;
  reason?: string;
};

type ListResponse = { status: Status; personas: PublicPersona[]; active: string | null };

export type PersonaLoginPanelProps = {
  /** Base path of the mounted API. Default "/api/persona-login". */
  apiBase?: string;
  /** Product name shown in the header. */
  appName?: string;
  /** Optional link back to the real sign-in page. */
  signInHref?: string;
  /** Force a full page load after switching (default). Set false to use router-less soft navigation. */
  hardNavigate?: boolean;
};

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  return (await response.json().catch(() => ({}))) as T & { error?: string };
}

export default function PersonaLoginPanel({ apiBase = "/api/persona-login", appName = "This app", signInHref, hardNavigate = true }: PersonaLoginPanelProps) {
  const [data, setData] = useState<ListResponse | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string>("");
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(apiBase, { cache: "no-store" });
    if (response.status === 404) { setUnavailable(true); return; }
    setData(await readJson<ListResponse>(response));
  }, [apiBase]);

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, { label: string; personas: PublicPersona[] }>();
    for (const persona of data?.personas ?? []) {
      if (!byGroup.has(persona.group)) {
        order.push(persona.group);
        byGroup.set(persona.group, { label: persona.groupLabel || persona.group.replace(/^\w/, (c) => c.toUpperCase()), personas: [] });
      }
      byGroup.get(persona.group)!.personas.push(persona);
    }
    return order.map((key) => ({ key, ...byGroup.get(key)! }));
  }, [data]);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    setBusy("unlock");
    setMessage(null);
    const response = await fetch(`${apiBase}/unlock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const body = await readJson<{ ok?: boolean; unlockDays?: number }>(response);
    setBusy("");
    if (!response.ok) { setMessage({ tone: "error", text: body.error || "Could not unlock." }); return; }
    setCode("");
    setMessage({ tone: "info", text: `Unlocked on this browser for ${body.unlockDays} days.` });
    await load();
  }

  async function become(persona: PublicPersona) {
    setBusy(persona.id);
    setMessage(null);
    const response = await fetch(apiBase, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personaId: persona.id }) });
    const body = await readJson<{ ok?: boolean; redirectTo?: string; needsUnlock?: boolean }>(response);
    if (!response.ok) {
      setBusy("");
      setMessage({ tone: "error", text: body.error || "Could not open that persona." });
      if (body.needsUnlock) await load();
      return;
    }
    const target = body.redirectTo || persona.landingPath;
    if (hardNavigate) window.location.assign(target);
    else window.history.pushState({}, "", target);
  }

  async function signOutAll() {
    setBusy("signout");
    setMessage(null);
    const response = await fetch(apiBase, { method: "DELETE" });
    const body = await readJson<{ ok?: boolean }>(response);
    setBusy("");
    setMessage(response.ok ? { tone: "info", text: "Signed out of every persona." } : { tone: "error", text: body.error || "Could not sign out." });
    await load();
  }

  async function seed() {
    setBusy("seed");
    setMessage(null);
    const response = await fetch(`${apiBase}/seed`, { method: "POST" });
    const body = await readJson<{ ok?: boolean; summary?: string }>(response);
    setBusy("");
    setMessage(response.ok ? { tone: "info", text: body.summary || "Demo data created." } : { tone: "error", text: body.error || "Could not create demo data." });
    await load();
  }

  async function forgetUnlock() {
    setBusy("lock");
    await fetch(apiBase, { method: "DELETE" }).catch(() => undefined);
    await fetch(`${apiBase}/unlock`, { method: "DELETE" });
    setBusy("");
    setMessage({ tone: "info", text: "Access code forgotten on this browser." });
    await load();
  }

  if (unavailable) {
    return (
      <section className="plPanel">
        <header className="plHeader">
          <p className="plEyebrow">Persona login</p>
          <h1>Not available here</h1>
          <p className="plLead">This tool is only enabled for local development and authorized beta testers.</p>
        </header>
        {signInHref && <a className="plLink" href={signInHref}>Go to the regular sign-in</a>}
      </section>
    );
  }

  if (!data) {
    return (
      <section className="plPanel" aria-busy="true">
        <header className="plHeader">
          <p className="plEyebrow">Persona login</p>
          <h1>Loading…</h1>
        </header>
      </section>
    );
  }

  const { status, active } = data;
  const envTag = status.environment === "production" ? "beta" : status.environment;

  return (
    <section className="plPanel">
      <header className="plHeader">
        <p className="plEyebrow">
          Persona login <span className={`plTag plTag-${envTag}`}>{envTag}</span>
        </p>
        <h1>Open {appName} as a persona</h1>
        <p className="plLead">
          Pick who you want to be. Existing persona sessions on this browser are replaced, and every switch is logged on the server.
        </p>
      </header>

      {!status.unlocked ? (
        <div className="plGate">
          <p className="plGateReason">{status.reason}</p>
          {status.codeAvailable && (
            <form className="plUnlock" onSubmit={unlock}>
              <label>
                Beta access code
                <input type="password" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Shared with you by the team" required />
              </label>
              <button className="plPrimary" type="submit" disabled={!code || busy === "unlock"}>{busy === "unlock" ? "Checking…" : "Unlock"}</button>
            </form>
          )}
          {status.allowlistAvailable && signInHref && (
            <a className="plLink" href={signInHref}>Or sign in with your beta email first</a>
          )}
        </div>
      ) : (
        <>
          {groups.length === 0 && (
            <div className="plEmpty">
              <p>No personas are available yet. The database has no organizations, owners, tenants, or vendors, or discovery is off (<code>PERSONA_LOGIN_LIVE_DISCOVERY=false</code>) and <code>PERSONA_LOGIN_LIVE_PERSONAS</code> is empty.</p>
              {status.canSeed && (
                <button className="plPrimary" type="button" disabled={Boolean(busy)} onClick={() => void seed()}>
                  {busy === "seed" ? "Creating…" : "Create demo data"}
                </button>
              )}
            </div>
          )}
          {groups.map((group) => (
            <div className="plGroup" key={group.key}>
              <h2>{group.label}</h2>
              <div className="plList">
                {group.personas.map((persona) => {
                  const isActive = active === persona.id;
                  return (
                    <div className={`plRow${isActive ? " plRow-active" : ""}`} key={persona.id}>
                      <div className="plRowText">
                        <strong>
                          {persona.label}
                          {persona.badge && <span className="plBadge">{persona.badge}</span>}
                          {isActive && <span className="plBadge plBadge-active">current</span>}
                        </strong>
                        {persona.description && <span>{persona.description}</span>}
                      </div>
                      <button className="plPrimary" type="button" disabled={Boolean(busy)} onClick={() => void become(persona)}>
                        {busy === persona.id ? "Opening…" : isActive ? "Reopen" : "Open"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="plActions">
            <button className="plGhost" type="button" disabled={Boolean(busy)} onClick={() => void signOutAll()}>
              {busy === "signout" ? "Signing out…" : "Sign out of all personas"}
            </button>
            {status.via === "code" && (
              <button className="plGhost" type="button" disabled={Boolean(busy)} onClick={() => void forgetUnlock()}>
                {busy === "lock" ? "…" : "Forget access code"}
              </button>
            )}
          </div>
        </>
      )}

      {message && <div className={`plNotice plNotice-${message.tone}`}>{message.text}</div>}

      <footer className="plFooter">
        <span>
          Access: {status.via === "open" ? "local development" : status.via === "code" ? "beta access code" : status.via === "allowlist" ? "allowlisted email" : "locked"}
        </span>
        {signInHref && <a className="plLink" href={signInHref}>Regular sign-in</a>}
      </footer>
    </section>
  );
}
