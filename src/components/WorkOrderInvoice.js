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
async function bearer() {
  const { data } = await getBrowserClient().auth.getSession();
  return data?.session?.access_token || "";
}

// Staff only: email this invoice to the property's owner.
function EmailInvoice({ id, hasLines }) {
  const [owner, setOwner] = useState(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [ccOffice, setCcOffice] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState({ kind: "", text: "" });

  useEffect(() => {
    getBrowserClient()
      .from("maintenance_requests")
      .select("staff_notes, unit:units(property:properties(owner:owners(name, email)))")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        const o = data?.unit?.property?.owner || {};
        const last = String(data?.staff_notes || "")
          .split("\n")
          .filter((l) => l.startsWith("Invoice emailed to"))
          .pop();
        setOwner({ name: o.name || "", email: o.email || "", last: last || "" });
      });
  }, [id]);

  async function send() {
    setBusy(true);
    setResult({ kind: "", text: "" });
    const res = await fetch(`/api/work-orders/${id}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await bearer()}` },
      body: JSON.stringify({ message, cc_office: ccOffice }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setResult({ kind: "err", text: json.error || "The email didn't send. Try again." });
    setOpen(false);
    setOwner((o) => ({ ...o, last: json.stamp }));
    setResult({ kind: "ok", text: `Sent to ${json.to}.` });
  }

  if (!owner) return null;
  return (
    <div className="boxed stack no-print" style={{ gap: 10 }}>
      <div className="req-actions" style={{ justifyContent: "space-between" }}>
        <span className="small">
          {owner.email ? (
            <>
              Landlord: <b>{owner.name || "Owner"}</b> · {owner.email}
            </>
          ) : (
            "This landlord has no email on file. Add one on the owner's page first."
          )}
          {owner.last ? <span className="sub-line">{owner.last}</span> : null}
        </span>
        {owner.email && !open ? (
          <button type="button" className="btn primary sm" onClick={() => setOpen(true)} disabled={!hasLines}>
            Email to landlord
          </button>
        ) : null}
      </div>
      {!hasLines ? <span className="small">Save the invoice lines on the work order before emailing it.</span> : null}
      {open ? (
        <div className="stack" style={{ gap: 8 }}>
          <div className="field">
            <label htmlFor="inv-msg">Message (optional)</label>
            <textarea
              id="inv-msg"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Hi ${owner.name || ""}, here is the invoice for the work Chuck completed…`}
            />
            <span className="small">Leave blank for a short standard note. The full itemized invoice is in the email.</span>
          </div>
          <label className="check-line">
            <input type="checkbox" checked={ccOffice} onChange={(e) => setCcOffice(e.target.checked)} />
            Send a copy to {SITE.email}
          </label>
          <div className="req-actions">
            <button type="button" className="btn primary sm" onClick={send} disabled={busy}>
              {busy ? "Sending…" : `Send to ${owner.email}`}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {result.text ? (
        <div className={result.kind === "err" ? "warnbox" : "okbox"} role={result.kind === "err" ? "alert" : "status"}>
          {result.text}
        </div>
      ) : null}
    </div>
  );
}

export default function WorkOrderInvoice({ id, backHref, backLabel, staff = false }) {
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

      {staff ? <EmailInvoice id={id} hasLines={lines.length > 0} /> : null}

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
