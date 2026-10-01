"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminChrome from "@/components/admin-chrome";
import { FEATURE_CATALOG, type FeatureMap, type SubscriptionPackage } from "@/lib/product-features";

export default function AdminPackagesPage() {
  const router = useRouter();
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");

  function load() {
    fetch("/api/admin/packages")
      .then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json() }))
      .then(({ ok, status, body }) => {
        if (status === 403) { router.replace("/admin/login"); return; }
        if (!ok) { setError(body.error || "Could not load packages."); return; }
        setPackages(body.packages || []);
      })
      .catch(() => setError("Could not load packages."));
  }

  useEffect(() => { load(); }, []);

  function patch(id: string, next: Partial<SubscriptionPackage>) {
    setPackages((rows) => rows.map((row) => row.id === id ? { ...row, ...next } : row));
  }

  function toggle(id: string, key: keyof FeatureMap, value: boolean) {
    setPackages((rows) => rows.map((row) => row.id === id ? { ...row, features: { ...row.features, [key]: value } } : row));
  }

  async function save(row: SubscriptionPackage) {
    setSaving(row.id);
    setError("");
    const response = await fetch("/api/admin/packages", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
    });
    const body = await response.json().catch(() => ({}));
    setSaving("");
    if (!response.ok) { setError(body.error || "Could not save that package."); return; }
    load();
  }

  return (
    <AdminChrome title="Subscription packages" active="packages">
      <header className="finHeader">
        <div>
          <p className="eyebrow">PLATFORM ADMIN</p>
          <h1>Base feature sets</h1>
        </div>
      </header>
      <p className="summary">Each subscription level is a default set of product flags. Organization overrides never change these bases unless you edit them here.</p>
      {error && <div className="notice">{error}</div>}
      <div className="adminPackageGrid">
        {packages.map((row) => (
          <section className="panel" key={row.id}>
            <div className="panelHead">
              <div>
                <p className="eyebrow">{row.id}</p>
                <h2><input value={row.name} onChange={(e) => patch(row.id, { name: e.target.value })} /></h2>
              </div>
              <label className="miniCheck">
                <input type="checkbox" checked={row.isDefault} onChange={(e) => patch(row.id, { isDefault: e.target.checked })} />
                <span>Default</span>
              </label>
            </div>
            <label>Description<textarea value={row.description} onChange={(e) => patch(row.id, { description: e.target.value })} /></label>
            <label>Monthly price (cents)<input type="number" min="0" value={row.monthlyCents} onChange={(e) => patch(row.id, { monthlyCents: Number(e.target.value) || 0 })} /></label>
            <div className="adminFlagList">
              {FEATURE_CATALOG.map((feature) => (
                <label key={feature.key} className="miniCheck">
                  <input type="checkbox" checked={row.features[feature.key]} onChange={(e) => toggle(row.id, feature.key, e.target.checked)} />
                  <span>
                    <strong>{feature.label}</strong>
                    <small>{feature.description}</small>
                  </span>
                </label>
              ))}
            </div>
            <button className="primary" disabled={saving === row.id} onClick={() => void save(row)}>
              {saving === row.id ? "Saving…" : "Save package"}
            </button>
          </section>
        ))}
      </div>
    </AdminChrome>
  );
}
