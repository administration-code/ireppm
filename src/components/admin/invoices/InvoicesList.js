"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { shortDate, todayISO } from "@/lib/rent";
import { INVOICE_STATUS, amount, invoiceNumber } from "@/lib/invoices";

const FILTERS = [
  { key: "unpaid", label: "Unpaid", test: (i) => i.status === "sent" },
  { key: "draft", label: "Drafts", test: (i) => i.status === "draft" },
  { key: "paid", label: "Paid", test: (i) => i.status === "paid" },
  { key: "void", label: "Void", test: (i) => i.status === "void" },
  { key: "all", label: "All", test: () => true },
];

// Staff: every invoice IRep has issued (leasing fees for leasing-only clients and anything else).
export default function InvoicesList() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("unpaid");
  const [find, setFind] = useState("");

  useEffect(() => {
    const sb = getBrowserClient();
    Promise.all([
      sb.from("invoices").select("id, invoice_no, status, bill_to_name, title, issue_date, due_date, paid_on, property:properties(address)").order("invoice_no", { ascending: false }).limit(500),
      sb.from("invoice_totals").select("invoice_id, total"),
    ]).then(([inv, tot]) => {
      const totals = new Map((tot.data || []).map((t) => [t.invoice_id, t.total]));
      setRows((inv.data || []).map((i) => ({ ...i, total: totals.get(i.id) || 0 })));
      if (inv.error) setError("We couldn't load the invoices. Refresh the page to try again.");
    });
  }, []);

  const today = todayISO();
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, (rows || []).filter(f.test).length])), [rows]);
  const q = find.trim().toLowerCase();
  const list = (rows || [])
    .filter(FILTERS.find((f) => f.key === filter).test)
    .filter((i) => !q || [invoiceNumber(i.invoice_no), i.bill_to_name, i.title, i.property?.address].join(" ").toLowerCase().includes(q));
  const outstanding = (rows || []).filter((i) => i.status === "sent").reduce((s, i) => s + Number(i.total), 0);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">Staff · Landlords</span>
        <div className="req-top">
          <h1 className="admin-title">Invoices</h1>
          <Link href="/admin/invoices/new" className="btn primary sm">
            New Invoice
          </Link>
        </div>
        <p className="small">
          Invoices IRep sends: leasing fees for leasing-only clients, and anything else that isn&apos;t taken off a landlord&apos;s statement.
          Each one is emailed with a PDF attached. Leasing-fee lines count toward the leasing fee split in the month the invoice is dated.
        </p>
        {outstanding > 0 ? (
          <p className="small">
            <b>{amount(outstanding)}</b> waiting to be paid.
          </p>
        ) : null}
      </div>

      <div className="req-actions" style={{ justifyContent: "space-between" }}>
        <div className="seg">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label} ({counts[f.key] || 0})
            </button>
          ))}
        </div>
        <div className="field" style={{ minWidth: 220 }}>
          <label htmlFor="inv-find" className="visually-hidden">
            Search invoices
          </label>
          <input id="inv-find" type="search" placeholder="Search name, property, number" value={find} onChange={(e) => setFind(e.target.value)} />
        </div>
      </div>

      {error ? <div className="warnbox">{error}</div> : null}
      {rows === null ? (
        <p className="small">Loading…</p>
      ) : !list.length ? (
        <p className="small">No invoices here.</p>
      ) : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Invoice</th>
                <th scope="col">Date</th>
                <th scope="col">Bill to</th>
                <th scope="col">For</th>
                <th scope="col" className="r">
                  Total
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((i) => {
                const overdue = i.status === "sent" && i.due_date && i.due_date < today;
                return (
                  <tr key={i.id}>
                    <td>
                      <Link href={`/admin/invoices/${i.id}`}>{i.status === "draft" ? "Draft" : invoiceNumber(i.invoice_no)}</Link>
                    </td>
                    <td>{shortDate(i.issue_date)}</td>
                    <td>{i.bill_to_name}</td>
                    <td>
                      {i.title}
                      {i.property?.address ? <span className="sub-line small">{i.property.address}</span> : null}
                    </td>
                    <td className="r num">{amount(i.total)}</td>
                    <td>
                      {i.status === "paid"
                        ? `Paid ${shortDate(i.paid_on)}`
                        : i.status === "sent"
                          ? overdue
                            ? <b style={{ color: "var(--red)" }}>Overdue since {shortDate(i.due_date)}</b>
                            : i.due_date
                              ? `Due ${shortDate(i.due_date)}`
                              : "Sent"
                          : INVOICE_STATUS[i.status]}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
