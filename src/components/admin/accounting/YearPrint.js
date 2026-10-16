"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountSummary, IncomeTable, OwnersTable, loadYear } from "./YearBoard";
import { RECON_STATUS_LABEL, monthOnly } from "@/lib/accounting";

export default function YearPrint({ year }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadYear(year).then(setData, (err) => setError(err.message));
  }, [year]);

  if (error) return <div className="warnbox">{error}</div>;
  if (!data) return <p className="small">Loading…</p>;

  return (
    <article className="receipt stack acct-print">
      <div className="row-actions no-print">
        <button type="button" className="btn" onClick={() => window.print()}>
          Print or save as PDF
        </button>
        <Link className="btn ghost" href={`/admin/accounting/year?year=${year}`}>
          Back to year end
        </Link>
      </div>

      <header>
        <p className="eyebrow">IRep Property Management</p>
        <h1 className="admin-title">{year} year-end summary</h1>
        <p className="small">
          Fiscal year January 1 – December 31, {year}.{" "}
          {data.close
            ? `Closed on ${new Date(data.close.closed_at).toLocaleDateString("en-CA", { dateStyle: "long" })} by ${
                data.close.who?.full_name || data.close.who?.email || "staff"
              }.`
            : "Not closed yet."}
        </p>
      </header>

      {data.accounts.map((a) => (
        <section key={a.id} className="stmt-section stack">
          <h2 className="sec-title">{a.name}</h2>
          <p className="small">
            {(a.months || [])
              .map((m) => `${monthOnly(m.period).slice(0, 3)}: ${RECON_STATUS_LABEL[m.status] || m.status}`)
              .join(" · ")}
          </p>
          <AccountSummary account={a} />
        </section>
      ))}

      <section className="stmt-section stack">
        <h2 className="sec-title">IRep income</h2>
        <IncomeTable rows={data.irep_income} year={year} />
      </section>

      <section className="stmt-section stack">
        <h2 className="sec-title">Landlords</h2>
        <OwnersTable rows={data.owners} />
      </section>

      {data.close?.notes ? (
        <section className="stmt-section">
          <h2 className="sec-title">Notes</h2>
          <p className="pre-line">{data.close.notes}</p>
        </section>
      ) : null}
    </article>
  );
}
