"use client";

import { useEffect, useState } from "react";
import BrandLockup from "@/components/brand-lockup";
import BrandIcon from "@/components/brand-icon";

type Connection = {
  id?: string;
  network: string;
  name?: string;
  sites?: string[];
  onboarding?: string;
  docsUrl?: string;
  applyEmail?: string;
  status: string;
  feedUrl?: string;
  partnerId?: string | null;
  lastSyncedAt?: string | null;
};

type Listing = {
  id: string;
  homeId: string;
  address: string;
  city: string;
  state: string;
  headline: string;
  description: string;
  rentCents: number;
  depositCents: number;
  availableOn: string;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  propertyType: string;
  petPolicy: string;
  leaseTerm: string;
  status: string;
};

type Publication = {
  listingId?: string;
  listing_id?: string;
  network: string;
  status: string;
  lastError?: string | null;
  last_error?: string | null;
};

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

export default function ListingsPage() {
  const [mode, setMode] = useState("checking");
  const [listings, setListings] = useState<Listing[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [homes, setHomes] = useState<Array<{ id: string; address: string; rent?: number; leaseEnds?: string }>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState("");
  const [draft, setDraft] = useState<Partial<Listing>>({});
  const [chosen, setChosen] = useState<Record<string, boolean>>({});

  async function load() {
    const response = await fetch("/api/listings");
    const body = await response.json();
    if (!response.ok) { setMode("error"); return; }
    setMode(body.mode);
    setListings(body.listings || []);
    setConnections(body.connections || []);
    setPublications(body.publications || []);
    setHomes(body.availableHomes || []);
    const first = body.listings?.[0]?.id;
    setSelectedId((current) => current && body.listings?.some((row: Listing) => row.id === current) ? current : first || null);
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3500); return () => clearTimeout(t); }, [toast]);

  const selected = listings.find((row) => row.id === selectedId) || null;
  useEffect(() => {
    if (!selected) { setDraft({}); return; }
    setDraft(selected);
    const live = Object.fromEntries(
      connections.map((connection) => [
        connection.network,
        publications.some((row) => (row.listingId || row.listing_id) === selected.id && row.network === connection.network && row.status === "published"),
      ]),
    );
    setChosen(live);
  }, [selected?.id, publications, connections]);

  async function saveListing() {
    if (!selected) return;
    setBusy("save");
    const response = await fetch(`/api/listings/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        headline: draft.headline,
        description: draft.description,
        rent: draft.rentCents != null ? draft.rentCents / 100 : undefined,
        deposit: draft.depositCents != null ? draft.depositCents / 100 : undefined,
        availableOn: draft.availableOn,
        bedrooms: draft.bedrooms,
        bathrooms: draft.bathrooms,
        squareFeet: draft.squareFeet,
        petPolicy: draft.petPolicy,
        leaseTerm: draft.leaseTerm,
        propertyType: draft.propertyType,
      }),
    });
    const body = await response.json();
    setBusy("");
    if (!response.ok) { setToast(body.error || "Could not save listing"); return; }
    setToast("Listing saved in HomeOps");
    await load();
  }

  async function createListing(homeId: string) {
    setBusy("create");
    const response = await fetch("/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeId }),
    });
    const body = await response.json();
    setBusy("");
    if (!response.ok) { setToast(body.error || "Could not create listing"); return; }
    setSelectedId(body.listing.id);
    setToast("Listing drafted from the Home Passport");
    await load();
  }

  async function toggleNetwork(network: string, enabled: boolean) {
    setBusy(network);
    const response = await fetch("/api/listings/connections", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network, enabled }),
    });
    const body = await response.json();
    setBusy("");
    if (!response.ok) { setToast(body.error || "Could not update integration"); return; }
    setToast(body.message || (enabled ? "Feed enabled" : "Disconnected"));
    await load();
  }

  async function publish() {
    if (!selected) return;
    const networks = Object.entries(chosen).filter(([, on]) => on).map(([id]) => id);
    if (!networks.length) { setToast("Choose at least one connected network"); return; }
    setBusy("publish");
    const response = await fetch(`/api/listings/${selected.id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ networks }),
    });
    const body = await response.json();
    setBusy("");
    if (!response.ok) { setToast(body.error || "Could not publish"); return; }
    setToast("Listing queued on the enabled feeds");
    await load();
  }

  async function unpublish() {
    if (!selected) return;
    setBusy("unpublish");
    const response = await fetch(`/api/listings/${selected.id}/publish`, { method: "DELETE" });
    const body = await response.json();
    setBusy("");
    if (!response.ok) { setToast(body.error || "Could not unpublish"); return; }
    setToast("Listing removed from syndication feeds");
    await load();
  }

  async function copy(url?: string) {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setToast("Feed URL copied");
  }

  const connectedCount = connections.filter((row) => row.status !== "disconnected").length;
  const liveCount = publications.filter((row) => row.status === "published").length;

  const field = (key: keyof Listing) => ({
    value: key === "availableOn" ? String((draft as Listing)?.[key] ?? "").slice(0, 10) : String((draft as Listing)?.[key] ?? ""),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const raw = e.target.value;
      const numeric = ["rentCents", "depositCents", "bedrooms", "bathrooms", "squareFeet"].includes(key);
      setDraft((current) => ({
        ...current,
        [key]: key === "rentCents" || key === "depositCents"
          ? Math.round(Number(raw) * 100)
          : numeric
            ? Number(raw)
            : raw,
      }));
    },
  });

  return (
    <main className="vendorShell">
      {toast && <div className="toast">{toast}</div>}
      <aside className="finSide">
        <BrandLockup href="/" className="finBrand" />
        <nav>
          <a className="finNav" href="/"><BrandIcon name="listing" className="navIcon" />Operations</a>
          <a className="finNav active" href="/listings"><BrandIcon name="listing" className="navIcon" />Listings</a>
          <a className="finNav" href="/payments"><BrandIcon name="rent" className="navIcon" />Payments</a>
          <a className="finNav" href="/financials"><BrandIcon name="rent" className="navIcon" />Books</a>
          <a className="finNav" href="/vendors"><BrandIcon name="applications" className="navIcon" />Approved Vendors</a>
        </nav>
        <div className="portfolio">
          <small>RENTAL LISTINGS</small>
          <strong>{listings.length} listings</strong>
          <span>{connectedCount} networks enabled</span>
          <span className={"mode " + mode}>{mode === "live" ? "● Supabase live" : mode === "demo" ? "○ Demo mode" : "Checking…"}</span>
        </div>
      </aside>
      <section className="vendorContent">
        <header className="finHeader">
          <div>
            <p className="eyebrow">ILS SYNDICATION</p>
            <h1>Manage listings here, syndicate out there.</h1>
            <p>HomeOps is the source of truth. Zillow, Apartments.com, Rent.com, Realtor.com, and Zumper pull from hosted feeds after they approve HomeOps as a partner. There is no public scrape-and-post API.</p>
          </div>
        </header>
        <div className="stats finStats">
          <div className="stat"><span>Listings</span><div className="statValue">{listings.length}</div></div>
          <div className="stat"><span>Live publications</span><div className="statValue">{liveCount}</div></div>
          <div className="stat"><span>Connected networks</span><div className="statValue">{connectedCount}</div></div>
        </div>

        <section className="panel">
          <div className="panelHead"><div><p className="eyebrow">LISTING NETWORKS</p><h2>Integrations</h2></div></div>
          <div className="networkGrid">
            {connections.map((connection) => (
              <div className="networkCard" key={connection.network}>
                <div className="networkHead">
                  <strong>{connection.name || connection.network}</strong>
                  <span className={`vendorStatus ${connection.status === "disconnected" ? "blocked" : "approved"}`}>
                    {connection.status === "disconnected" ? "Off" : connection.status === "connected" ? "Push ready" : "Feed ready"}
                  </span>
                </div>
                <p>{(connection.sites || []).join(" · ")}</p>
                <small>{connection.onboarding}</small>
                {connection.docsUrl && <a href={connection.docsUrl} target="_blank" rel="noreferrer">Zillow feed program</a>}
                {connection.applyEmail && <span>Onboard: {connection.applyEmail}</span>}
                {connection.status !== "disconnected" && connection.feedUrl && (
                  <button className="textBtn" onClick={() => void copy(connection.feedUrl)}>Copy feed URL</button>
                )}
                <button
                  className={connection.status === "disconnected" ? "primary" : "secondaryBtn"}
                  disabled={busy === connection.network}
                  onClick={() => void toggleNetwork(connection.network, connection.status === "disconnected")}
                >
                  {connection.status === "disconnected" ? "Enable feed" : "Disconnect"}
                </button>
              </div>
            ))}
          </div>
        </section>

        <div className="listingLayout">
          <section className="panel">
            <div className="panelHead"><div><p className="eyebrow">PORTFOLIO</p><h2>Listings</h2></div></div>
            <div className="taskList">
              {listings.map((listing) => (
                <button key={listing.id} className={selectedId === listing.id ? "homeRow selected" : "homeRow"} onClick={() => setSelectedId(listing.id)}>
                  <div>
                    <strong>{listing.address}</strong>
                    <span>{listing.headline}</span>
                  </div>
                  <span className={`tag ${listing.status === "published" ? "normal" : "high"}`}>{listing.status}</span>
                </button>
              ))}
            </div>
            {!!homes.length && (
              <>
                <div className="sectionTitle"><h3>Create from a Home Passport</h3></div>
                {homes.map((home) => (
                  <div className="credential" key={home.id}>
                    <div><strong>{home.address}</strong><span>{home.leaseEnds ? `Lease ends ${home.leaseEnds}` : "No listing yet"}</span></div>
                    <button className="secondaryBtn" disabled={busy === "create"} onClick={() => void createListing(home.id)}>Draft listing</button>
                  </div>
                ))}
              </>
            )}
          </section>
          <section className="panel">
            {selected ? (
              <>
                <div className="panelHead"><div><p className="eyebrow">HOMEOPS LISTING</p><h2>{selected.address}</h2><p>{money(selected.rentCents)} · {selected.bedrooms} bed / {selected.bathrooms} bath</p></div></div>
                <div className="formGrid">
                  <label className="span2">Headline<input {...field("headline")} /></label>
                  <label>Rent ($)<input type="number" value={draft.rentCents ? draft.rentCents / 100 : ""} onChange={field("rentCents").onChange} /></label>
                  <label>Deposit ($)<input type="number" value={draft.depositCents ? draft.depositCents / 100 : ""} onChange={field("depositCents").onChange} /></label>
                  <label>Beds<input type="number" step="0.5" {...field("bedrooms")} /></label>
                  <label>Baths<input type="number" step="0.5" {...field("bathrooms")} /></label>
                  <label>Sq ft<input type="number" {...field("squareFeet")} /></label>
                  <label>Available<input type="date" {...field("availableOn")} /></label>
                  <label>Lease term<input {...field("leaseTerm")} /></label>
                  <label>Pets<input {...field("petPolicy")} /></label>
                  <label className="span2">Description<textarea rows={5} {...field("description")} /></label>
                </div>
                <div className="sectionTitle"><h3>Syndicate to</h3></div>
                <div className="chipRow">
                  {connections.map((connection) => (
                    <label className="miniCheck" key={connection.network}>
                      <input
                        type="checkbox"
                        checked={Boolean(chosen[connection.network])}
                        disabled={connection.status === "disconnected"}
                        onChange={(e) => setChosen((current) => ({ ...current, [connection.network]: e.target.checked }))}
                      />
                      <span>{connection.name}{connection.status === "disconnected" ? " (enable feed first)" : ""}</span>
                    </label>
                  ))}
                </div>
                <div className="modalActions">
                  <button className="secondaryBtn" disabled={Boolean(busy)} onClick={() => void saveListing()}>Save listing</button>
                  <button className="secondaryBtn" disabled={Boolean(busy)} onClick={() => void unpublish()}>Unpublish</button>
                  <button className="primary" disabled={Boolean(busy)} onClick={() => void publish()}>{busy === "publish" ? "Publishing…" : "Publish to selected networks"}</button>
                </div>
                <div className="jobLogList">
                  {publications.filter((row) => (row.listingId || row.listing_id) === selected.id).map((row) => (
                    <div className="jobLogRow" key={row.network}>
                      <strong>{row.network}</strong>
                      <span>{row.status}{(row.lastError || row.last_error) ? ` · ${row.lastError || row.last_error}` : ""}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <Empty text="Draft a listing from a Home Passport to start syndicating." />}
          </section>
        </div>
      </section>
    </main>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}
