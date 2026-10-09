"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import VendorPortalFrame from "@/components/vendor-portal-frame";

type Account = {
  name: string;
  email: string;
  phone: string;
  website: string;
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  emergencyAvailable: boolean;
  trades: string[];
  otherTrades: string;
};

const empty: Account = {
  name: "", email: "", phone: "", website: "", address1: "", city: "", state: "", postalCode: "",
  emergencyAvailable: false, trades: [], otherTrades: "",
};

export default function VendorAccountPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account>(empty);
  const [catalog, setCatalog] = useState<Array<{ slug: string; name: string }>>([]);
  const [signInEmail, setSignInEmail] = useState("");
  const [canEdit, setCanEdit] = useState(true);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/vendors/account").then(async (response) => {
      if (response.status === 401) { router.replace("/vendors/login"); return null; }
      return response.json();
    }).then((body) => {
      if (!body) return;
      if (body.error) { setMessage(body.error); return; }
      setAccount({ ...empty, ...body.account });
      setCatalog(body.tradeCatalog || []);
      setSignInEmail(body.signInEmail || "");
      setCanEdit(body.canEdit !== false);
    }).catch(() => setMessage("Could not load the company account."));
  }, [router]);

  function toggleTrade(slug: string) {
    setAccount((current) => ({
      ...current,
      trades: current.trades.includes(slug) ? current.trades.filter((row) => row !== slug) : [...current.trades, slug],
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/vendors/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(account),
    });
    const body = await response.json();
    setSaving(false);
    if (!response.ok) { setMessage(body.error || "Could not save the company account."); return; }
    setAccount({ ...empty, ...body.account });
    setMessage("Company account saved. Bid notifications now use these trades.");
  }

  return (
    <VendorPortalFrame
      eyebrow="ACCOUNT"
      title="Company account"
      lede="Update the name, contact details, and trades managers use when they look up this company. The sign-in email stays on the login you used to open the desk."
    >
      {message && <div className="notice">{message}</div>}
      {!canEdit && <div className="notice">A company owner or dispatcher updates this account. You can review it here.</div>}
      <form className="formGrid accountForm" onSubmit={(event) => void save(event)}>
        <label>Sign-in email
          <input value={signInEmail} readOnly />
        </label>
        <label>Company name
          <input required disabled={!canEdit} value={account.name} onChange={(event) => setAccount({ ...account, name: event.target.value })} />
        </label>
        <label>Company email
          <input type="email" disabled={!canEdit} value={account.email} onChange={(event) => setAccount({ ...account, email: event.target.value })} placeholder="office@company.com" />
        </label>
        <label>Phone
          <input disabled={!canEdit} value={account.phone} onChange={(event) => setAccount({ ...account, phone: event.target.value })} placeholder="(801) 555-0100" />
        </label>
        <label>Website
          <input disabled={!canEdit} value={account.website} onChange={(event) => setAccount({ ...account, website: event.target.value })} placeholder="https://" />
        </label>
        <label>Street
          <input disabled={!canEdit} value={account.address1} onChange={(event) => setAccount({ ...account, address1: event.target.value })} />
        </label>
        <label>City
          <input disabled={!canEdit} value={account.city} onChange={(event) => setAccount({ ...account, city: event.target.value })} />
        </label>
        <label>State
          <input disabled={!canEdit} value={account.state} maxLength={2} onChange={(event) => setAccount({ ...account, state: event.target.value.toUpperCase() })} placeholder="UT" />
        </label>
        <label>Postal code
          <input disabled={!canEdit} value={account.postalCode} onChange={(event) => setAccount({ ...account, postalCode: event.target.value })} />
        </label>
        <label className="checkRow">
          <input type="checkbox" disabled={!canEdit} checked={account.emergencyAvailable} onChange={(event) => setAccount({ ...account, emergencyAvailable: event.target.checked })} />
          <span><strong>Emergency calls</strong><small>Managers can send after-hours emergencies to this company.</small></span>
        </label>
        <div className="accountTrades">
          <span>Trades</span>
          <div className="chipRow">
            {catalog.map((trade) => (
              <label className="checkRow" key={trade.slug}>
                <input type="checkbox" disabled={!canEdit} checked={account.trades.includes(trade.slug)} onChange={() => toggleTrade(trade.slug)} />
                <span>{trade.name}</span>
              </label>
            ))}
          </div>
        </div>
        <label>Other trades
          <input disabled={!canEdit} value={account.otherTrades} onChange={(event) => setAccount({ ...account, otherTrades: event.target.value })} placeholder="Garage door, painting" />
        </label>
        {canEdit && <button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save account"}</button>}
      </form>
    </VendorPortalFrame>
  );
}
