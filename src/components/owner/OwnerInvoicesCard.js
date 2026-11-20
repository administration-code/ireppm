"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { shortDate } from "@/lib/rent";
import { amount, invoiceNumber } from "@/lib/invoices";
import { openInvoicePdf } from "@/lib/invoice-client";

// Landlord portal: invoices IRep has sent them (leasing fees and other charges billed separately).
export default function OwnerInvoicesCard() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .rpc("owner_invoices")
      .then(({ data }) => alive && setRows(Array.isArray(data) ? data : []));
    return () => {
      alive = false;
    };
  }, []);

  if (!rows.length) return null;

  async function view(id) {
    setError("");
    const problem = await openInvoicePdf(id);
    if (problem) setError(problem);
  }

  return (
    <section className="boxed stack" aria-labelledby="sec-own-inv">
      <h2 id="sec-own-inv" className="sec-title">
        Invoices
      </h2>
      <div className="table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Invoice</th>
              <th scope="col">For</th>
              <th scope="col" className="r">
                Total
              </th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="visually-hidden">PDF</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {invoiceNumber(r.invoice_no)}
                  <span className="sub-line small">{shortDate(r.issue_date)}</span>
                </td>
                <td>
                  {r.title}
                  {r.address ? <span className="sub-line small">{r.address}</span> : null}
                </td>
                <td className="r num">{amount(r.total)}</td>
                <td>{r.status === "paid" ? `Paid ${shortDate(r.paid_on)}` : r.due_date ? `Due ${shortDate(r.due_date)}` : "Due on receipt"}</td>
                <td className="r">
                  <button type="button" className="link-btn small" onClick={() => view(r.id)}>
                    View PDF
                  </button>
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
