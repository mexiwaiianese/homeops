"use client";

// Compact "Open as…" picker for one persona group, meant to sit under a real sign-in form
// (e.g. the owner login page shows only owner personas). Same API and gating as the full panel:
// hidden when the feature is off, asks for the beta access code when locked, lists personas when open.
// Portable: talks only to the persona-login API. Styles come from persona-login.css.

import { useCallback, useEffect, useState } from "react";
import "./persona-login.css";

type PublicPersona = { id: string; label: string; description?: string; group: string; groupLabel?: string; landingPath: string; badge?: string };
type Status = { enabled: boolean; unlocked: boolean; codeAvailable: boolean; allowlistAvailable: boolean; via: string | null; environment: string; canSeed?: boolean; reason?: string };
type ListResponse = { status: Status; personas: PublicPersona[]; active: string | null };

export type PersonaQuickLoginProps = {
  /** Persona group to show, e.g. "owner". Omit to show every group. */
  group?: string;
  /** Heading. Defaults to "Open as a test persona". */
  title?: string;
  apiBase?: string;
  /** Link to the full switcher page. Set to null to hide. */
  allPersonasHref?: string | null;
  /** Rendered instead of the picker when the feature is unavailable (404). */
  children?: React.ReactNode;
};

async function readJson<T>(response: Response): Promise<T & { error?: string; needsUnlock?: boolean }> {
  return (await response.json().catch(() => ({}))) as T & { error?: string; needsUnlock?: boolean };
}

export default function PersonaQuickLogin({ group, title = "Open as a test persona", apiBase = "/api/persona-login", allPersonasHref = "/dev/personas", children }: PersonaQuickLoginProps) {
  const [data, setData] = useState<ListResponse | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(apiBase, { cache: "no-store" }).catch(() => null);
    if (!response || response.status === 404) { setUnavailable(true); return; }
    setData(await readJson<ListResponse>(response));
  }, [apiBase]);

  useEffect(() => { void load(); }, [load]);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    setBusy("unlock");
    setMessage(null);
    const response = await fetch(`${apiBase}/unlock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const body = await readJson<{ ok?: boolean }>(response);
    setBusy("");
    if (!response.ok) { setMessage({ tone: "error", text: body.error || "Could not unlock." }); return; }
    setCode("");
    await load();
  }

  async function become(persona: PublicPersona) {
    setBusy(persona.id);
    setMessage(null);
    const response = await fetch(apiBase, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personaId: persona.id }) });
    const body = await readJson<{ ok?: boolean; redirectTo?: string }>(response);
    if (!response.ok) {
      setBusy("");
      setMessage({ tone: "error", text: body.error || "Could not open that persona." });
      if (body.needsUnlock) await load();
      return;
    }
    window.location.assign(body.redirectTo || persona.landingPath);
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

  if (unavailable) return <>{children ?? null}</>;
  if (!data) return null;

  const { status, active } = data;
  const personas = group ? data.personas.filter((row) => row.group === group) : data.personas;
  const envTag = status.environment === "production" ? "beta" : status.environment;

  return (
    <section className="plQuick" aria-label={title}>
      <div className="plQuickHead">
        <h3>
          {title} <span className={`plTag plTag-${envTag}`}>{envTag}</span>
        </h3>
        <span>{status.unlocked ? "No password" : "Beta testers"}</span>
      </div>

      {!status.unlocked ? (
        <div className="plGate plGate-compact">
          <p className="plGateReason">{status.reason}</p>
          {status.codeAvailable && (
            <form className="plUnlock plUnlock-row" onSubmit={unlock}>
              <input type="password" autoComplete="one-time-code" aria-label="Beta access code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Beta access code" required />
              <button className="plPrimary" type="submit" disabled={!code || busy === "unlock"}>{busy === "unlock" ? "…" : "Unlock"}</button>
            </form>
          )}
        </div>
      ) : personas.length === 0 ? (
        <div className="plEmpty">
          <p>No {group ? `${group} ` : ""}personas are available on this server yet.</p>
          {status.canSeed && (
            <button className="plPrimary" type="button" disabled={Boolean(busy)} onClick={() => void seed()}>
              {busy === "seed" ? "Creating…" : "Create demo data"}
            </button>
          )}
        </div>
      ) : (
        <div className="plList">
          {personas.map((persona) => {
            const isActive = active === persona.id;
            return (
              <div className={`plRow${isActive ? " plRow-active" : ""}`} key={persona.id}>
                <div className="plRowText">
                  <strong>
                    {persona.label}
                    {isActive && <span className="plBadge plBadge-active">current</span>}
                  </strong>
                  {persona.description && <span>{persona.description}</span>}
                </div>
                <button className="plPrimary" type="button" disabled={Boolean(busy)} onClick={() => void become(persona)}>
                  {busy === persona.id ? "Opening…" : "Open"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {message && <div className={`plNotice plNotice-${message.tone}`}>{message.text}</div>}
      {allPersonasHref && <a className="plLink plQuickAll" href={allPersonasHref}>All personas</a>}
    </section>
  );
}
