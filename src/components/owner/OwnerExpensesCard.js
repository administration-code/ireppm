"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { monthLabel, shortDate } from "@/lib/rent";
import { openExpenseInvoice } from "@/lib/expense-files";

// Landlord portal: bills IRep paid for them at their request, the statement they come off, and the bill itself.
export default function OwnerExpensesCard() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .rpc("owner_expenses")
      .then(({ data }) => alive && setRows(Array.isArray(data) ? data : []));
    return () => {
      alive = false;
    };
  }, []);

  if (!rows.length) return null;
  const multi = new Set(rows.map((r) => r.address)).size > 1;

  async function view(r) {
    setError("");
    const problem = await openExpenseInvoice(r.id);
    if (problem) setError(problem);
  }

  return (
    <section className="boxed stack" aria-labelledby="sec-own-exp">
      <h2 id="sec-own-exp" className="sec-title">
        Bills Paid on Your Behalf
      </h2>
      <p className="small" style={{ margin: 0 }}>
        Bills you asked IRep to pay for you. Each one is deducted on the monthly statement shown.
      </p>
      <div className="table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Bill</th>
              <th scope="col" className="r">
                Amount
              </th>
              <th scope="col">Deducted on</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="visually-hidden">Bill</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.payee}
                  <span className="sub-line small">
                    {[multi ? r.address : "", r.description, r.invoice_ref ? `Invoice ${r.invoice_ref}` : "", r.bill_date ? `Dated ${shortDate(r.bill_date)}` : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </td>
                <td className="r num">{money(r.amount)}</td>
                <td>{monthLabel(r.statement_period)} statement</td>
                <td>{r.status === "paid" ? `Paid ${shortDate(r.paid_on)}` : "To be paid"}</td>
                <td className="r">
                  {r.has_bill ? (
                    <button type="button" className="link-btn small" onClick={() => view(r)}>
                      View Bill
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error ? <div className="warnbox">{error}</div> : null}
    </section>
  );
}
