"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { SITE } from "@/lib/site";
import { shortDate } from "@/lib/rent";
import { CHARGE_TO } from "@/lib/maintenance";
import { IRepMark } from "@/components/Brand";
import { invoiceNumber } from "@/lib/work-order-invoice";

const qty = (n) => (Number(n) % 1 === 0 ? String(Number(n)) : Number(n).toFixed(2));

// Printable itemized invoice for one work order (staff, or the landlord who owns the property).
export default function WorkOrderInvoice({ id, backHref, backLabel }) {
  const [state, setState] = useState({ loading: true, inv: null, error: "" });

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .rpc("work_order_invoice", { p_request_id: id })
      .then(({ data, error }) => {
        if (!alive) return;
        setState({ loading: false, inv: data, error: error ? "We couldn't load this invoice." : "" });
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const { loading, inv, error } = state;
  if (loading) return <p className="small">Loading invoice…</p>;
  if (!inv) {
    return (
      <div className="stack">
        <div className="warnbox">{error || "This invoice isn't available."}</div>
        {backHref ? <Link href={backHref}>{backLabel}</Link> : null}
      </div>
    );
  }

  const place = [inv.address, inv.city, inv.postal_code].filter(Boolean).join(", ");
  const unit = inv.unit && inv.unit !== "Whole property" && !/^Other \(/.test(inv.unit) ? inv.unit : null;
  const lines = Array.isArray(inv.lines) ? inv.lines : [];

  function print() {
    const old = document.title;
    document.title = `${invoiceNumber(inv.invoice_no)} - ${inv.address}`;
    window.print();
    setTimeout(() => {
      document.title = old;
    }, 1000);
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="receipt-tools no-print">
        {backHref ? <Link href={backHref}>{backLabel}</Link> : null}
        <div className="req-actions">
          <button type="button" className="btn primary sm" onClick={print}>
            Print / Save as PDF
          </button>
        </div>
      </div>

      <article className="receipt letter invoice" aria-label={`Invoice ${invoiceNumber(inv.invoice_no)}`}>
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

        <h1 className="receipt-title">Work Order Invoice</h1>

        <div className="invoice-meta">
          <dl>
            <div>
              <dt>Invoice</dt>
              <dd>{invoiceNumber(inv.invoice_no)}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{inv.completed_on ? shortDate(inv.completed_on) : "Not completed yet"}</dd>
            </div>
            {inv.charge_to && inv.charge_to !== "owner" ? (
              <div>
                <dt>Paid by</dt>
                <dd>{CHARGE_TO[inv.charge_to] || inv.charge_to}</dd>
              </div>
            ) : null}
          </dl>
          <dl>
            <div>
              <dt>Bill to</dt>
              <dd>
                {inv.owner_name || "Owner"}
                {inv.owner_address ? <span className="sub-line">{inv.owner_address}</span> : null}
              </dd>
            </div>
            <div>
              <dt>Property</dt>
              <dd>
                {place}
                {unit ? <span className="sub-line">{unit}</span> : null}
              </dd>
            </div>
          </dl>
        </div>

        <section className="letter-section">
          <h2 className="letter-h2">{inv.title}</h2>
          {inv.description ? <p className="pre-line">{inv.description}</p> : null}
        </section>

        <table className="letter-table invoice-lines">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col" className="r">
                Qty
              </th>
              <th scope="col" className="r">
                Unit price
              </th>
              <th scope="col" className="r">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.length ? (
              lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    {l.description}
                    {!l.taxable ? <span className="small sub-line">No HST</span> : null}
                  </td>
                  <td className="r num">{qty(l.quantity)}</td>
                  <td className="r num">{money(l.unit_price)}</td>
                  <td className="r num">{money(l.amount)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>
                  {inv.actual_cost ? `${inv.title}: ${money(inv.actual_cost)} (not itemized)` : "No charges on this work order."}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {lines.length ? (
          <dl className="letter-summary invoice-totals">
            <div>
              <dt>Subtotal</dt>
              <dd className="num">{money(inv.subtotal)}</dd>
            </div>
            <div>
              <dt>HST ({Number(inv.hst_percent)}%)</dt>
              <dd className="num">{money(inv.hst)}</dd>
            </div>
            <div className="letter-strong">
              <dt>Total</dt>
              <dd className="num">{money(inv.total)}</dd>
            </div>
          </dl>
        ) : null}

        {inv.notes ? <p className="letter-staff-note pre-line">{inv.notes}</p> : null}

        <p className="receipt-note">
          {inv.charge_to === "owner"
            ? "This amount is deducted from your monthly rent payout. Nothing needs to be paid separately."
            : "Not charged to you; shown for your records."}{" "}
          Questions? Call {SITE.phone} or email {SITE.email}.
        </p>
      </article>
    </div>
  );
}
