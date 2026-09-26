"use client";

// Compact "Open as…" picker for one persona group, meant to sit under a real sign-in form
// (e.g. the owner login page shows only owner personas). Same API and gating as the full panel,
// but it never shows beta UI to the public: it renders nothing (or the fallback children) unless
// the feature is on AND the visitor is already unlocked. The beta access code is entered on the
// full switcher page (/dev/personas), not on the sign-in pages.
// Portable: talks only to the persona-login API. Styles come from persona-login.css.

import { useCallback, useEffect, useState } from "react";
import "./persona-login.css";

type PublicPersona = { id: string; label: string; description?: string; group: string; groupLabel?: string; landingPath: string; badge?: string };
type Status = { enabled: boolean; unlocked: boolean; codeAvailable: boolean; allowlistAvailable: boolean; via: string | null; environment: string; canSeed?: boolean; warnings?: string[]; reason?: string };
type ListResponse = { status: Status; personas: PublicPersona[]; active: string | null };

export type PersonaQuickLoginProps = {
  /** Persona group to show, e.g. "owner". Omit to show every group. */
  group?: string;
  /** Heading. Defaults to "Open as a test persona". */
  title?: string;
  apiBase?: string;
  /** Link to the full switcher page. Set to null to hide. */
  allPersonasHref?: string | null;
  /** Rendered instead of the picker when the feature is unavailable (404) or the visitor is not unlocked. */
  children?: React.ReactNode;
};

async function readJson<T>(response: Response): Promise<T & { error?: string; needsUnlock?: boolean }> {
  return (await response.json().catch(() => ({}))) as T & { error?: string; needsUnlock?: boolean };
}

export default function PersonaQuickLogin({ group, title = "Open as a test persona", apiBase = "/api/persona-login", allPersonasHref = "/dev/personas", children }: PersonaQuickLoginProps) {
  const [data, setData] = useState<ListResponse | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(apiBase, { cache: "no-store" }).catch(() => null);
    if (!response || response.status === 404) { setUnavailable(true); return; }
    setData(await readJson<ListResponse>(response));
  }, [apiBase]);

  useEffect(() => { void load(); }, [load]);

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
    const response = await fetch(`${apiBase}/seed`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reset: false }) });
    const body = await readJson<{ ok?: boolean; summary?: string }>(response);
    setBusy("");
    setMessage(response.ok ? { tone: "info", text: body.summary || "Demo data created." } : { tone: "error", text: body.error || "Could not create demo data." });
    await load();
  }

  // Feature off, still loading, or visitor not unlocked: show the caller's fallback (if any) and no beta UI.
  if (unavailable) return <>{children ?? null}</>;
  if (!data) return null;
  if (!data.status.unlocked) return <>{children ?? null}</>;

  const { status, active } = data;
  const personas = group ? data.personas.filter((row) => row.group === group) : data.personas;
  const envTag = status.environment === "production" ? "beta" : status.environment;

  return (
    <section className="plQuick" aria-label={title}>
      <div className="plQuickHead">
        <h3>
          {title} <span className={`plTag plTag-${envTag}`}>{envTag}</span>
        </h3>
        <span>No password</span>
      </div>

      {personas.length === 0 ? (
        <div className="plEmpty">
          {status.warnings?.map((warning) => <p key={warning}>{warning}</p>)}
          {!status.warnings?.length && <p>No {group ? `${group} ` : ""}personas are available on this server yet.</p>}
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
