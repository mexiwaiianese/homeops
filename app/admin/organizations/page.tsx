"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminChrome from "@/components/admin-chrome";

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  demo: boolean;
  packageId: string;
  packageName: string;
  status: string;
  ownerEmail?: string;
};

type PackageOption = { id: string; name: string };

export default function AdminOrganizationsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<OrgRow[]>([]);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [packageId, setPackageId] = useState("all");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/organizations")
      .then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json() }))
      .then(({ ok, status, body }) => {
        if (status === 403) { router.replace("/admin/login"); return; }
        if (!ok) { setError(body.error || "Could not load organizations."); return; }
        setRows(body.organizations || []);
        setPackages((body.packages || []).map((row: PackageOption) => ({ id: row.id, name: row.name })));
      })
      .catch(() => setError("Could not load organizations."));
  }, [router]);

  const typeOptions = packages.length
    ? packages
    : [...new Map(rows.map((row) => [row.packageId, row.packageName])).entries()].map(([id, name]) => ({ id, name }));
  const visible = packageId === "all" ? rows : rows.filter((row) => row.packageId === packageId);
  const selected = typeOptions.find((row) => row.id === packageId);

  return (
    <AdminChrome title="Organizations" active="organizations">
      <header className="finHeader">
        <div>
          <p className="eyebrow">PLATFORM ADMIN</p>
          <h1>Users and organizations</h1>
        </div>
      </header>
      <p className="summary">Open an organization to override features independently of its subscription package.</p>
      {error && <div className="notice">{error}</div>}
      <div className="orgTypeFilter">
        <label>
          Org type
          <select value={packageId} onChange={(event) => setPackageId(event.target.value)}>
            <option value="all">All types</option>
            {typeOptions.map((row) => (
              <option key={row.id} value={row.id}>{row.name}</option>
            ))}
          </select>
        </label>
        <span>{visible.length} of {rows.length}</span>
      </div>
      <section className="panel tablePanel">
        <div className="table">
          <div className="tr head">
            <span>Organization</span>
            <span>Members</span>
            <span>Package</span>
            <span>Status</span>
            <span></span>
          </div>
          {visible.map((row) => (
            <div className="tr" key={row.id}>
              <span>
                <strong>{row.name}</strong>
                <small>{row.slug}{row.demo ? " · demo sandbox" : ""}{row.ownerEmail ? ` · ${row.ownerEmail}` : ""}</small>
              </span>
              <span>{row.memberCount}</span>
              <span>{row.packageName}</span>
              <span>{row.status}</span>
              <span><a className="textBtn" href={`/admin/organizations/${row.id}`}>Feature flags</a></span>
            </div>
          ))}
          {!visible.length && <div className="empty">{rows.length ? `No organizations on ${selected?.name || "this type"}.` : "No organizations yet."}</div>}
        </div>
      </section>
    </AdminChrome>
  );
}
