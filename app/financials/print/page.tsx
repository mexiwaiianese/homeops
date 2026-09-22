"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import BooksReportView from "@/components/books-report-view";
import { parseReportYear, type YearReport } from "@/lib/books-reports";

function PrintReportsInner() {
  const year = parseReportYear(useSearchParams().get("year"));
  const [report, setReport] = useState<YearReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/financial/reports?year=${year}`)
      .then(async (response) => {
        const body = await response.json();
        if (cancelled) return;
        if (response.status === 401) {
          setError("Sign in to print live books.");
          return;
        }
        if (!response.ok) {
          setError(body.error || "Could not load the report packet.");
          return;
        }
        setReport(body.report);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the report packet.");
      });
    return () => {
      cancelled = true;
    };
  }, [year]);

  if (error) {
    return (
      <main className="reportDoc">
        <p className="summary">{error}</p>
        <p><a href="/financials">Back to Books</a></p>
      </main>
    );
  }
  if (!report) {
    return (
      <main className="reportDoc">
        <p className="summary">Building the {year} packet…</p>
      </main>
    );
  }
  return (
    <main>
      <BooksReportView report={report} variant="print" />
    </main>
  );
}

export default function PrintReportsPage() {
  return (
    <Suspense fallback={<main className="reportDoc"><p className="summary">Building the packet…</p></main>}>
      <PrintReportsInner />
    </Suspense>
  );
}
