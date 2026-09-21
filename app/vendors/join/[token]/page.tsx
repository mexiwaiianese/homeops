"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import BrandLockup from "@/components/brand-lockup";

type Invite = {
  organizationName: string;
  companyName?: string;
  categoryName?: string;
  registered?: boolean;
  registeredAt?: string | null;
  contact?: { email?: string | null; phone?: string | null };
  error?: string;
};

export default function VendorJoinPage() {
  const params = useParams<{ token: string }>();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [status, setStatus] = useState<"loading" | "form" | "done" | "error">("loading");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    website: "",
    city: "",
    state: "UT",
    postalCode: "",
    emergencyAvailable: true,
    afterHoursAvailable: false,
  });

  useEffect(() => {
    fetch(`/api/vendors/join/${params.token}`)
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => {
        if (!ok) { setStatus("error"); setMessage(body.error || "This invitation is not valid."); return; }
        setInvite(body);
        setForm((current) => ({
          ...current,
          companyName: body.companyName || "",
          email: body.contact?.email || "",
          phone: body.contact?.phone || "",
        }));
        if (body.registered) {
          setStatus("done");
          setMessage(`${body.companyName} is registered with ${body.organizationName}. Received ${body.registeredAt ? new Date(body.registeredAt).toLocaleString() : "previously"}.`);
          return;
        }
        setStatus("form");
      })
      .catch(() => { setStatus("error"); setMessage("Could not load this invitation."); });
  }, [params.token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus("loading");
    const response = await fetch(`/api/vendors/join/${params.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await response.json();
    if (!response.ok) { setStatus("form"); setMessage(body.error || "Could not complete registration."); return; }
    setStatus("done");
    setMessage(body.confirmation);
    setInvite((current) => current ? { ...current, registered: true, registeredAt: body.registeredAt } : current);
  }

  return (
    <main className="intakeShell">
      <section className="intakeCard">
        <BrandLockup artwork="lockup" />
        {status === "done" ? (
          <div className="successPanel">
            <p className="eyebrow">REGISTRATION CONFIRMED</p>
            <h1>You are registered.</h1>
            <p>{message}</p>
            <p>A manager will review credentials before this company can be dispatched. Public review scores are not used as operational performance.</p>
          </div>
        ) : status === "error" ? (
          <div className="notice error">{message}</div>
        ) : status === "loading" && !invite ? (
          <p>Loading invitation…</p>
        ) : (
          <form onSubmit={submit}>
            <p className="eyebrow">PRIVATE INVITATION</p>
            <h1>Join {invite?.organizationName || "this"} approved vendor program</h1>
            <p>This registers your company for internal review. It is not a public marketplace listing, and you should not upload tax or insurance documents here.</p>
            {invite?.categoryName && <p>Matched trade: {invite.categoryName}</p>}
            <label>Company name<input required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></label>
            <label>Primary contact<input required value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></label>
            <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label>Mobile phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label>Website<input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label>
            <label>City<input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
            <label>State<input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></label>
            <label className="checkRow"><input type="checkbox" checked={form.emergencyAvailable} onChange={(e) => setForm({ ...form, emergencyAvailable: e.target.checked })} /><span><strong>Emergency work</strong><small>We can respond after hours for urgent property issues.</small></span></label>
            {message && <div className="notice">{message}</div>}
            <button className="primary" disabled={status === "loading"}>{status === "loading" ? "Saving…" : "Register my company"}</button>
          </form>
        )}
      </section>
    </main>
  );
}
