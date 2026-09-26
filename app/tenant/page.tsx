"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BrandLockup from "@/components/brand-lockup";
import { leavePersona } from "@/lib/persona-sign-out-client";
import StripePayForm from "@/components/stripe-pay-form";
import StripeSetupForm from "@/components/stripe-setup-form";
import { moneyCents } from "@/lib/rent";
import {
  issueCategories,
  tenantStatusHint,
  tenantStatusLabel,
  type TenantPaymentMethod,
  type TenantPublic,
  type TenantRequest,
} from "@/lib/tenant-portal";

type Payment = { id: string; amountCents: number; method: string; status: string; receivedAt: string; failureReason?: string | null };
type Charge = {
  id: string;
  kind: string;
  periodStart: string;
  dueOn: string;
  amountCents: number;
  paidCents: number;
  remainingCents: number;
  status: string;
  notes?: string | null;
  payments: Payment[];
};
type Overview = {
  mode: "demo" | "live";
  tenant: TenantPublic;
  stripe: boolean;
  publishableKey: string | null;
  summary: { dueCents: number; dueCount: number; nextDueOn: string | null };
  charges: Charge[];
  paymentMethods: TenantPaymentMethod[];
  requests: TenantRequest[];
};

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const kindLabel = (kind: string) => ({ rent: "Rent", deposit: "Deposit", late_fee: "Late fee", other: "Charge" } as Record<string, string>)[kind] || kind;
const methodLabel = (method: string) => ({ stripe_card: "Card", stripe_ach: "Bank transfer", cash: "Cash", check: "Check", demo: "Demo payment", other: "Other" } as Record<string, string>)[method] || method;
const chargeStatus = (status: string) => ({ due: "Due", processing: "Processing", paid: "Paid", failed: "Payment failed", partial: "Partially paid", void: "Voided" } as Record<string, string>)[status] || status;

export default function TenantPortalPage() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/tenant/overview", { cache: "no-store" });
    if (response.status === 401) { router.replace("/tenant/login"); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error || "Could not load your portal."); setLoading(false); return; }
    setData(body);
    setError("");
    setLoading(false);
  }, [router]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 4000); return () => clearTimeout(t); }, [toast]);

  async function signOut() {
    await leavePersona("/api/tenant/session", "/tenant/login");
  }

  if (loading) {
    return <main className="tenantShell"><section className="tenantCard"><BrandLockup artwork="lockup" /><p>Loading your portal…</p></section></main>;
  }
  if (!data) {
    return (
      <main className="tenantShell">
        <section className="tenantCard">
          <BrandLockup artwork="lockup" />
          <div className="notice error">{error || "Could not load your portal."}</div>
          <a className="secondaryBtn" href="/tenant/login">Back to sign-in</a>
        </section>
      </main>
    );
  }

  return (
    <main className="tenantShell">
      {toast && <div className="toast">{toast}</div>}
      <section className="tenantCard">
        <div className="deskHead">
          <BrandLockup artwork="lockup" />
          <button className="textBtn" onClick={() => void signOut()}>Sign out</button>
        </div>
        <p className="eyebrow">TENANT PORTAL</p>
        <h1>{data.tenant.name}</h1>
        <p className="tenantAddress">{data.tenant.address}{data.tenant.city ? ` · ${data.tenant.city}` : ""}</p>
        {data.mode === "demo" && <div className="notice">Demo portal. {data.stripe ? "Stripe test keys are active; payments hit Stripe test mode and post to the demo ledger." : "No Stripe keys on this server, so payments and saved methods are simulated."}</div>}
        {error && <div className="notice error">{error}</div>}

        <BalancePanel data={data} onChanged={load} onToast={setToast} />
        <PaymentMethodsPanel data={data} onChanged={load} onToast={setToast} />
        <ReportIssuePanel onCreated={load} onToast={setToast} />
        <RequestsPanel requests={data.requests} />
        <HistoryPanel charges={data.charges} />
      </section>
    </main>
  );
}

function BalancePanel({ data, onChanged, onToast }: { data: Overview; onChanged: () => Promise<void>; onToast: (m: string) => void }) {
  const [paying, setPaying] = useState<Charge | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [chooseMethod, setChooseMethod] = useState(false);
  const openCharges = useMemo(() => data.charges.filter((row) => row.remainingCents > 0 && row.status !== "void").sort((a, b) => a.dueOn.localeCompare(b.dueOn)), [data.charges]);
  const defaultMethod = data.paymentMethods.find((row) => row.isDefault) || data.paymentMethods[0] || null;

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/tenant/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json().catch(() => ({}));
    return { ok: response.ok, body: json };
  }

  async function payWithSaved(charge: Charge, method: TenantPaymentMethod | null) {
    setBusy(charge.id);
    setMessage("");
    const { ok, body } = await post(method ? { chargeId: charge.id, paymentMethodId: method.id } : { chargeId: charge.id });
    setBusy("");
    if (!ok) { setMessage(body.error || "Payment could not be completed."); return; }
    if (body.requiresAction && body.clientSecret) {
      setPaying(charge);
      setClientSecret(body.clientSecret);
      setMessage("Your bank needs one more confirmation step.");
      return;
    }
    if (body.clientSecret) { setPaying(charge); setClientSecret(body.clientSecret); return; }
    onToast(body.processing ? "Payment submitted. Bank transfers take a few days to clear." : `Paid ${money(charge.remainingCents)}. Thank you.`);
    setPaying(null);
    setChooseMethod(false);
    await onChanged();
  }

  async function payWithNew(charge: Charge) {
    setBusy(charge.id);
    setMessage("");
    const { ok, body } = await post({ chargeId: charge.id });
    setBusy("");
    if (!ok) { setMessage(body.error || "Could not start checkout."); return; }
    if (body.paid) { onToast(`Paid ${money(charge.remainingCents)}.`); await onChanged(); return; }
    setPaying(charge);
    setClientSecret(body.clientSecret);
  }

  async function finishStripe(paymentIntentId?: string, status?: string) {
    if (paymentIntentId) await post({ action: "confirm", paymentIntentId });
    onToast(status === "processing" ? "Payment submitted. Bank transfers take a few days to clear." : "Payment received. Thank you.");
    setPaying(null);
    setClientSecret(null);
    setChooseMethod(false);
    await onChanged();
  }

  return (
    <section className="tenantPanel balancePanel">
      <div className="balanceHead">
        <div>
          <p className="eyebrow">BALANCE</p>
          <strong className={`balanceAmount ${data.summary.dueCents ? "" : "clear"}`}>{money(data.summary.dueCents)}</strong>
          <span>{data.summary.dueCount ? `${data.summary.dueCount} open ${data.summary.dueCount === 1 ? "charge" : "charges"}${data.summary.nextDueOn ? ` · due ${day(data.summary.nextDueOn)}` : ""}` : "Nothing due right now."}</span>
        </div>
        {!!openCharges.length && !paying && (
          <div className="balanceActions">
            {defaultMethod ? (
              <>
                <button className="primary" disabled={Boolean(busy)} onClick={() => void payWithSaved(openCharges[0], defaultMethod)}>
                  {busy === openCharges[0].id ? "Paying…" : `Pay ${money(openCharges[0].remainingCents)} with ${defaultMethod.label}`}
                </button>
                <button className="textBtn" onClick={() => setChooseMethod((v) => !v)}>Use a different method</button>
              </>
            ) : (
              <button className="primary" disabled={Boolean(busy)} onClick={() => void payWithNew(openCharges[0])}>
                {busy === openCharges[0].id ? "Starting…" : data.stripe ? `Pay ${money(openCharges[0].remainingCents)}` : `Pay ${money(openCharges[0].remainingCents)} (demo)`}
              </button>
            )}
          </div>
        )}
      </div>
      {message && <div className="notice error">{message}</div>}
      {chooseMethod && !paying && openCharges[0] && (
        <div className="methodChooser">
          {data.paymentMethods.map((method) => (
            <button key={method.id} className="secondaryBtn" disabled={Boolean(busy)} onClick={() => void payWithSaved(openCharges[0], method)}>{method.label}</button>
          ))}
          {data.stripe && <button className="secondaryBtn" disabled={Boolean(busy)} onClick={() => void payWithNew(openCharges[0])}>New card or bank account</button>}
        </div>
      )}
      {paying && clientSecret && data.publishableKey && (
        <div className="stripeBox">
          <p className="summary">Paying {money(paying.remainingCents)} for {kindLabel(paying.kind).toLowerCase()} due {day(paying.dueOn)}. Stripe processes the payment; HomeOps keeps the receipt. This method is saved for next time.</p>
          <StripePayForm publishableKey={data.publishableKey} clientSecret={clientSecret} onPaid={finishStripe} buttonLabel={`Pay ${money(paying.remainingCents)}`} />
          <button className="textBtn" onClick={() => { setPaying(null); setClientSecret(null); }}>Cancel</button>
        </div>
      )}
      {openCharges.length > 1 && (
        <div className="credentialList chargeList">
          {openCharges.map((charge) => (
            <div className="credential" key={charge.id}>
              <div>
                <strong>{kindLabel(charge.kind)} · {money(charge.remainingCents)}</strong>
                <span>Due {day(charge.dueOn)} · {chargeStatus(charge.status)}{charge.notes ? ` · ${charge.notes}` : ""}</span>
              </div>
              <button className="secondaryBtn" disabled={Boolean(busy)} onClick={() => defaultMethod ? void payWithSaved(charge, defaultMethod) : void payWithNew(charge)}>{busy === charge.id ? "…" : "Pay"}</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PaymentMethodsPanel({ data, onChanged, onToast }: { data: Overview; onChanged: () => Promise<void>; onToast: (m: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [demoForm, setDemoForm] = useState({ type: "card", last4: "4242" });

  async function call(method: "POST" | "DELETE", body: Record<string, unknown>) {
    const response = await fetch("/api/tenant/payment-methods", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(json.error || "Could not update payment methods."); return null; }
    setMessage("");
    return json;
  }

  async function startAdd() {
    setMessage("");
    if (!data.stripe) { setAdding(true); return; }
    setBusy("setup");
    const json = await call("POST", { action: "setup" });
    setBusy("");
    if (!json) return;
    setSetupSecret(json.clientSecret);
    setAdding(true);
  }

  async function addDemo(e: FormEvent) {
    e.preventDefault();
    setBusy("demo");
    const json = await call("POST", { action: "add-demo", type: demoForm.type, last4: demoForm.last4, brand: "visa", bankName: "Demo Bank" });
    setBusy("");
    if (!json) return;
    setAdding(false);
    onToast("Payment method added.");
    await onChanged();
  }

  async function makeDefault(id: string) {
    setBusy(id);
    const json = await call("POST", { action: "default", paymentMethodId: id });
    setBusy("");
    if (json) { onToast("Default payment method updated."); await onChanged(); }
  }

  async function remove(id: string) {
    if (!confirm("Remove this payment method?")) return;
    setBusy(id);
    const json = await call("DELETE", { paymentMethodId: id });
    setBusy("");
    if (json) { onToast("Payment method removed."); await onChanged(); }
  }

  return (
    <section className="tenantPanel">
      <div className="sectionTitle">
        <h3>Payment methods</h3>
        <span>{data.stripe ? "Stored securely by Stripe" : "Demo"}</span>
      </div>
      {message && <div className="notice error">{message}</div>}
      <div className="credentialList">
        {data.paymentMethods.length ? data.paymentMethods.map((method) => (
          <div className="credential" key={method.id}>
            <div>
              <strong>{method.label}{method.isDefault && <b className="defaultPill">Default</b>}</strong>
              <span>{method.type === "card" ? `Card${method.expMonth ? ` · expires ${String(method.expMonth).padStart(2, "0")}/${method.expYear}` : ""}` : "Bank account (ACH)"}</span>
            </div>
            <div className="methodActions">
              {!method.isDefault && <button className="textBtn" disabled={Boolean(busy)} onClick={() => void makeDefault(method.id)}>Make default</button>}
              <button className="textBtn danger" disabled={Boolean(busy)} onClick={() => void remove(method.id)}>Remove</button>
            </div>
          </div>
        )) : <div className="empty">No payment method on file yet. Add a card or bank account to pay in one tap.</div>}
      </div>
      {!adding ? (
        <button className="secondaryBtn addMethodBtn" disabled={busy === "setup"} onClick={() => void startAdd()}>{busy === "setup" ? "Starting…" : "Add card or bank account"}</button>
      ) : data.stripe && setupSecret && data.publishableKey ? (
        <div className="stripeBox">
          <StripeSetupForm
            publishableKey={data.publishableKey}
            clientSecret={setupSecret}
            onCancel={() => { setAdding(false); setSetupSecret(null); }}
            onSaved={async (paymentMethodId) => {
              setAdding(false);
              setSetupSecret(null);
              if (paymentMethodId && !data.paymentMethods.length) await call("POST", { action: "default", paymentMethodId });
              onToast("Payment method saved.");
              await onChanged();
            }}
          />
        </div>
      ) : (
        <form className="demoMethodForm" onSubmit={addDemo}>
          <label>Type
            <select value={demoForm.type} onChange={(e) => setDemoForm({ ...demoForm, type: e.target.value })}>
              <option value="card">Card</option>
              <option value="us_bank_account">Bank account</option>
            </select>
          </label>
          <label>Last 4 digits
            <input value={demoForm.last4} maxLength={4} inputMode="numeric" onChange={(e) => setDemoForm({ ...demoForm, last4: e.target.value.replace(/\D/g, "") })} />
          </label>
          <div className="visitActions">
            <button className="primary" type="submit" disabled={busy === "demo"}>{busy === "demo" ? "Saving…" : "Save demo method"}</button>
            <button className="secondaryBtn" type="button" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}

function ReportIssuePanel({ onCreated, onToast }: { onCreated: () => Promise<void>; onToast: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: "plumbing", title: "", description: "", emergency: false, availability: "", permissionToEnter: true });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/tenant/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setMessage(body.error || "Could not submit your request."); return; }
    setForm({ category: "plumbing", title: "", description: "", emergency: false, availability: "", permissionToEnter: true });
    setOpen(false);
    onToast("Request sent. Your property manager has it.");
    await onCreated();
  }

  return (
    <section className="tenantPanel">
      <div className="sectionTitle">
        <h3>Report an issue</h3>
        <span>Creates a work order for your manager</span>
      </div>
      {!open ? (
        <div className="reportPrompt">
          <p>Leak, no heat, broken appliance, pests, anything that needs attention. Your manager sees it right away and can send an approved vendor.</p>
          <button className="primary" onClick={() => setOpen(true)}>Report a problem</button>
        </div>
      ) : (
        <form className="reportForm" onSubmit={submit}>
          <label>What kind of issue?
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {issueCategories.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
            </select>
          </label>
          <label>Short title
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Kitchen sink is leaking underneath" />
          </label>
          <label>What is happening?
            <textarea required rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="When did it start? Where exactly? What have you tried?" />
          </label>
          <label>Best times for a visit
            <input value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })} placeholder="e.g. weekdays after 3 PM, or anytime with notice" />
          </label>
          <label className="checkRow">
            <input type="checkbox" checked={form.permissionToEnter} onChange={(e) => setForm({ ...form, permissionToEnter: e.target.checked })} />
            <span><strong>OK to enter if I am not home</strong><small>The vendor will still give notice before arriving.</small></span>
          </label>
          <label className="checkRow">
            <input type="checkbox" checked={form.emergency} onChange={(e) => setForm({ ...form, emergency: e.target.checked })} />
            <span><strong>This is urgent</strong><small>Active flooding, no heat in cold weather, electrical hazard, lockout, or a safety issue.</small></span>
          </label>
          {form.emergency && <div className="notice">If there is fire, a gas smell, or immediate danger, call 911 or your utility emergency line first.</div>}
          {message && <div className="notice error">{message}</div>}
          <div className="visitActions">
            <button className="primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Send to my property manager"}</button>
            <button className="secondaryBtn" type="button" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}

function RequestsPanel({ requests }: { requests: TenantRequest[] }) {
  const open = requests.filter((row) => row.status !== "documented");
  const closed = requests.filter((row) => row.status === "documented");
  return (
    <section className="tenantPanel">
      <div className="sectionTitle">
        <h3>Your requests</h3>
        <span>{open.length} open · {closed.length} closed</span>
      </div>
      <div className="credentialList">
        {requests.length ? [...open, ...closed].map((row) => (
          <div className={`credential requestRow ${row.status === "documented" ? "closed" : ""}`} key={row.id}>
            <div>
              <strong>{row.title}{row.priority === "emergency" && <b className="tag emergency">Urgent</b>}</strong>
              <span>{tenantStatusHint(row.status, row.vendorName)} Opened {day(row.openedAt)}.</span>
            </div>
            <b className={`statusPill s-${row.status}`}>{tenantStatusLabel(row.status)}</b>
          </div>
        )) : <div className="empty">No requests yet. Anything you report shows up here with live status.</div>}
      </div>
    </section>
  );
}

function HistoryPanel({ charges }: { charges: Charge[] }) {
  const rows = useMemo(() => charges
    .flatMap((charge) => charge.payments.map((payment) => ({ ...payment, kind: charge.kind, dueOn: charge.dueOn })))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)), [charges]);
  const ledger = useMemo(() => [...charges].sort((a, b) => b.dueOn.localeCompare(a.dueOn)), [charges]);
  return (
    <section className="tenantPanel">
      <div className="sectionTitle">
        <h3>Payment history</h3>
        <span>{rows.length} payments</span>
      </div>
      <div className="credentialList">
        {rows.length ? rows.map((row) => (
          <div className="credential" key={row.id}>
            <div>
              <strong>{money(row.amountCents)} · {kindLabel(row.kind)}</strong>
              <span>{day(row.receivedAt)} · {methodLabel(row.method)}{row.failureReason ? ` · ${row.failureReason}` : ""}</span>
            </div>
            <b className={`statusPill p-${row.status}`}>{row.status === "succeeded" ? "Paid" : row.status === "pending" ? "Processing" : row.status === "failed" ? "Failed" : row.status}</b>
          </div>
        )) : <div className="empty">No payments recorded yet.</div>}
      </div>
      <div className="sectionTitle">
        <h3>Charges</h3>
        <span>{ledger.length} on your account</span>
      </div>
      <div className="credentialList">
        {ledger.map((charge) => (
          <div className="credential" key={charge.id}>
            <div>
              <strong>{kindLabel(charge.kind)} · {money(charge.amountCents)}</strong>
              <span>Due {day(charge.dueOn)}{charge.paidCents && charge.remainingCents ? ` · ${money(charge.paidCents)} paid, ${money(charge.remainingCents)} remaining` : ""}</span>
            </div>
            <b className={`statusPill c-${charge.status}`}>{chargeStatus(charge.status)}</b>
          </div>
        ))}
      </div>
    </section>
  );
}
