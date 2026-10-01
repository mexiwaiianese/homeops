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
  packageName: string;
  status: string;
  ownerEmail?: string;
};

export default function AdminOrganizationsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<OrgRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/organizations")
      .then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json() }))
      .then(({ ok, status, body }) => {
        if (status === 403) { router.replace("/admin/login"); return; }
        if (!ok) { setError(body.error || "Could not load organizations."); return; }
        setRows(body.organizations || []);
      })
      .catch(() => setError("Could not load organizations."));
  }, [router]);

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
      <section className="panel tablePanel">
        <div className="table">
          <div className="tr head">
            <span>Organization</span>
            <span>Members</span>
            <span>Package</span>
            <span>Status</span>
            <span></span>
          </div>
          {rows.map((row) => (
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
          {!rows.length && <div className="empty">No organizations yet.</div>}
        </div>
      </section>
    </AdminChrome>
  );
}
