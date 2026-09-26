"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import VendorPortalFrame from "@/components/vendor-portal-frame";

type Row = {
  id: string;
  title: string;
  propertyLabel: string;
  amountCents: number;
  status: "upcoming" | "invoiced" | "paid" | "overdue";
  dueOn: string;
  note: string;
};

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

const statusCopy: Record<Row["status"], string> = {
  upcoming: "Not yet collectible",
  invoiced: "Collect on the due date",
  paid: "Collected",
  overdue: "Past due — follow up",
};

export default function VendorReceivablesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState({ upcomingCents: 0, invoicedCents: 0, overdueCents: 0, paidCents: 0 });
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/vendors/receivables").then(async (r) => {
      if (r.status === 401) { router.replace("/vendors/login"); return null; }
      return r.json();
    }).then((body) => {
      if (!body) return;
      if (body.error) { setMessage(body.error); return; }
      setRows(body.receivables || []);
      setTotals(body.totals || totals);
    }).catch(() => setMessage("Could not load receivables."));
  }, [router]);

  return (
    <VendorPortalFrame
      eyebrow="ACCOUNTS RECEIVABLE"
      title="What you can collect."
      lede="Upcoming amounts are awarded work you cannot invoice until the job is documented. Invoiced amounts are due from the property manager. Overdue amounts are already past that date."
    >
      {message && <div className="notice">{message}</div>}
      <div className="miniStats vendorMini">
        <div><span>Upcoming</span><strong>{money(totals.upcomingCents)}</strong></div>
        <div><span>Invoiced</span><strong>{money(totals.invoicedCents)}</strong></div>
        <div><span>Overdue</span><strong>{money(totals.overdueCents)}</strong></div>
        <div><span>Collected</span><strong>{money(totals.paidCents)}</strong></div>
      </div>
      <div className="credentialList">
        {rows.map((row) => (
          <div className="credential" key={row.id}>
            <div>
              <strong>{row.title}</strong>
              <span>{row.propertyLabel} · Due {row.dueOn} · {money(row.amountCents)} · {statusCopy[row.status]}</span>
              <span>{row.note}</span>
            </div>
            <span className={"vendorStatus " + (row.status === "paid" ? "approved" : row.status === "overdue" ? "suspended" : "conditional")}>{row.status}</span>
          </div>
        ))}
      </div>
    </VendorPortalFrame>
  );
}
