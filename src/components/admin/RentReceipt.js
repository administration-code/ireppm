"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { SITE } from "@/lib/site";
import { loadReceipt } from "@/lib/receipt";
import { METHOD_LABEL, PAYMENT_KIND_LABEL, monthLabel, shortDate } from "@/lib/rent";
import { IRepMark } from "@/components/Brand";

const paymentFor = (p) => (p.kind === "rent" ? monthLabel(p.period) : PAYMENT_KIND_LABEL[p.kind] || "Other");

export default function RentReceipt({ params }) {
  const [state, setState] = useState({ loading: true, receipt: null, error: "" });
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState({ ok: false, text: "" });

  useEffect(() => {
    let alive = true;
    loadReceipt(getBrowserClient(), params).then(
      (receipt) => {
        if (!alive) return;
        setState({ loading: false, receipt, error: "" });
        setTo(receipt?.tenants.find((t) => t.email)?.email || "");
      },
      () => alive && setState({ loading: false, receipt: null, error: "We couldn't load this receipt. Refresh the page to try again." })
    );
    return () => {
      alive = false;
    };
  }, [params]);

  const { loading, receipt, error } = state;

  async function sendEmail() {
    setSending(true);
    setSendMsg({ ok: false, text: "" });
    try {
      const { data } = await getBrowserClient().auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error("Your sign-in has expired. Sign in again and retry.");
      const res = await fetch("/api/rent/receipt-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...params, to }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "The email didn't send. Try again.");
      setSendMsg({ ok: true, text: `Receipt emailed to ${to}.` });
    } catch (err) {
      setSendMsg({ ok: false, text: err.message });
    }
    setSending(false);
  }

  if (loading) return <p className="small">Loading receipt…</p>;
  if (!receipt || !receipt.payments.length) {
    return (
      <div className="empty">
        <h2>{error ? "Something went wrong" : "No receipt to show"}</h2>
        <p>
          {error ||
            "There are no matched payments for this receipt. Split or ignored payments, and payments not yet matched to a tenancy, don't get receipts."}
        </p>
        <Link className="btn ghost" href="/admin/rent">
          Back to Rent
        </Link>
      </div>
    );
  }

  const withEmail = receipt.tenants.filter((t) => t.email);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="receipt-tools no-print">
        <Link className="back" href="/admin/rent">
          ← Rent
        </Link>
        <div className="req-actions">
          <button type="button" className="btn primary sm" onClick={() => window.print()}>
            Print / Save as PDF
          </button>
          {withEmail.length ? (
            <>
              <label className="visually-hidden" htmlFor="receipt-to">
                Tenant to email
              </label>
              <select id="receipt-to" value={to} onChange={(e) => setTo(e.target.value)} className="cell-input">
                {withEmail.map((t) => (
                  <option key={t.email} value={t.email}>
                    {t.full_name} — {t.email}
                  </option>
                ))}
              </select>
              <button type="button" className="btn ghost sm" onClick={sendEmail} disabled={sending || !to}>
                {sending ? "Sending…" : "Email to tenant"}
              </button>
            </>
          ) : (
            <span className="small">No tenant email on file, so this can&apos;t be emailed.</span>
          )}
        </div>
        {sendMsg.text ? (
          <div className={sendMsg.ok ? "okbox" : "warnbox"} role="status">
            {sendMsg.text}
          </div>
        ) : null}
      </div>

      <article className="receipt" aria-label="Rent receipt">
        <header className="receipt-head">
          <div className="receipt-brand">
            <IRepMark />
            <span className="wm">
              <b>IREP</b>
              <i>PROPERTY MANAGEMENT</i>
            </span>
          </div>
          <address className="receipt-office">
            {SITE.name}
            <br />
            {SITE.address}
            <br />
            {SITE.phone}
            <br />
            {SITE.email}
          </address>
        </header>

        <h1 className="receipt-title">Rent Receipt</h1>
        <dl className="kv receipt-facts">
          <dt>Receipt number</dt>
          <dd className="num">{receipt.number}</dd>
          <dt>Date issued</dt>
          <dd>{shortDate(receipt.issued)}</dd>
          <dt>Tenant</dt>
          <dd>{receipt.tenants.map((t) => t.full_name).join(", ") || "—"}</dd>
          <dt>Rental unit</dt>
          <dd>{receipt.unitAddress}</dd>
          {receipt.range ? (
            <>
              <dt>Period covered</dt>
              <dd>
                {shortDate(receipt.range.from)} to {shortDate(receipt.range.to)}
              </dd>
            </>
          ) : null}
        </dl>

        <table className="receipt-table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">For</th>
              <th scope="col">Method</th>
              <th scope="col" className="r">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {receipt.payments.map((p) => (
              <tr key={p.id}>
                <td>{shortDate(p.received_on)}</td>
                <td>{paymentFor(p)}</td>
                <td>{METHOD_LABEL[p.method] || p.method}</td>
                <td className="r num">{money(p.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3}>
                Total received
              </th>
              <td className="r num">{money(receipt.total)}</td>
            </tr>
          </tfoot>
        </table>

        <p className="receipt-note">Received by {SITE.name} on behalf of the landlord.</p>
      </article>
    </div>
  );
}
