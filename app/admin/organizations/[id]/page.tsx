"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminChrome from "@/components/admin-chrome";
import { FEATURE_CATALOG, type FeatureKey, type FeatureOverrides, type SubscriptionPackage } from "@/lib/product-features";

type Payload = {
  organization: { id: string; name: string; slug: string };
  subscription: {
    packageId: string;
    package: SubscriptionPackage;
    overrides: FeatureOverrides;
    features: Record<FeatureKey, boolean>;
    status: string;
  };
  packages: SubscriptionPackage[];
};

export default function AdminOrganizationFlagsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [packageId, setPackageId] = useState("");
  const [overrides, setOverrides] = useState<FeatureOverrides>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    fetch(`/api/admin/organizations/${id}`)
      .then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json() }))
      .then(({ ok, status, body }) => {
        if (status === 403) { router.replace("/admin/login"); return; }
        if (!ok) { setError(body.error || "Could not load this organization."); return; }
        setData(body);
        setPackageId(body.subscription.packageId);
        setOverrides(body.subscription.overrides || {});
      })
      .catch(() => setError("Could not load this organization."));
  }

  useEffect(() => { if (id) load(); }, [id]);

  function setOverride(key: FeatureKey, value: "inherit" | "on" | "off") {
    setOverrides((current) => {
      const next = { ...current };
      if (value === "inherit") delete next[key];
      if (value === "on") next[key] = true;
      if (value === "off") next[key] = false;
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    const response = await fetch(`/api/admin/organizations/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageId, overrides }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { setError(body.error || "Could not save overrides."); return; }
    load();
  }

  const pkg = data?.packages.find((row) => row.id === packageId) || data?.subscription.package;

  return (
    <AdminChrome title={data?.organization.name || "Organization"} active="organizations">
      <header className="finHeader">
        <div>
          <p className="eyebrow">ORGANIZATION FLAGS</p>
          <h1>{data?.organization.name || "Organization"}</h1>
        </div>
        <a className="secondaryBtn" href="/admin/organizations">All organizations</a>
      </header>
      {error && <div className="notice">{error}</div>}
      {data && (
        <section className="panel">
          <label>
            Base package
            <select value={packageId} onChange={(e) => setPackageId(e.target.value)}>
              {data.packages.map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          </label>
          <p className="summary">Inherit uses the package. On/Off overrides that one feature for this organization only.</p>
          <div className="adminFlagList">
            {FEATURE_CATALOG.map((feature) => {
              const inherited = pkg?.features[feature.key];
              const current = overrides[feature.key];
              const value = current === true ? "on" : current === false ? "off" : "inherit";
              return (
                <div className="adminOverrideRow" key={feature.key}>
                  <div>
                    <strong>{feature.label}</strong>
                    <small>{feature.description} · package default: {inherited ? "on" : "off"}</small>
                  </div>
                  <select value={value} onChange={(e) => setOverride(feature.key, e.target.value as "inherit" | "on" | "off")}>
                    <option value="inherit">Inherit</option>
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </div>
              );
            })}
          </div>
          <button className="primary" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save organization flags"}</button>
        </section>
      )}
    </AdminChrome>
  );
}
