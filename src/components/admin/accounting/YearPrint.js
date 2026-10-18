"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountSummary, ExpensesTable, IncomeTable, OwnersTable, loadYear } from "./YearBoard";
import { monthOnly } from "@/lib/accounting";

export default function YearPrint({ year }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadYear(year).then(setData, (err) => setError(err.message));
  }, [year]);

  if (error) return <div className="warnbox">{error}</div>;
  if (!data) return <p className="small">Loading…</p>;

  return (
    <article className="receipt stack acct-print year-print">
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

      <div className="year-accounts stack">
        {data.accounts.map((a) => {
          const by = (st) => (a.months || []).filter((m) => m.status === st).map((m) => monthOnly(m.period).slice(0, 3));
          const locked = by("locked");
          const balanced = by("balanced");
          const open = by("open");
          return (
            <section key={a.id} className="stmt-section stack">
              <h2 className="sec-title">{a.name}</h2>
              <p className="year-months">
                {[
                  locked.length ? `Locked: ${locked.join(", ")}` : "",
                  balanced.length ? `Balanced: ${balanced.join(", ")}` : "",
                  open.length ? `Open: ${open.join(", ")}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <AccountSummary account={a} />
            </section>
          );
        })}
      </div>

      <section className="stmt-section stack">
        <h2 className="sec-title">IRep income</h2>
        <IncomeTable rows={data.irep_income} year={year} hst={data.hst_collected} />
        <ExpensesTable rows={data.irep_expenses} />
      </section>

      <section className="stmt-section can-split stack">
        <h2 className="sec-title">Landlords</h2>
        <OwnersTable rows={data.owners} year={year} />
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
