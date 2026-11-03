"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { DEFAULT_HST_PERCENT } from "@/lib/admin-properties";
import { invoiceNumber, invoiceTotals } from "@/lib/work-order-invoice";

const key = () => Math.random().toString(36).slice(2);
const blank = () => ({ key: key(), description: "", quantity: "1", unit_price: "", taxable: true });
const money2 = (v) => /^\d+(\.\d{1,2})?$/.test(String(v ?? "").trim());

// Staff: the work order's itemized invoice. Saving sets the actual cost to the total
// (with HST; IRep-paid work has no HST billed) and the partner's pay to the subtotal.
export default function WorkOrderInvoiceEditor({ request, onSaved }) {
  const id = useId();
  const [lines, setLines] = useState(null);
  const [notes, setNotes] = useState(request.invoice_notes || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .from("work_order_lines")
      .select("description, quantity, unit_price, taxable, sort")
      .eq("request_id", request.id)
      .order("sort")
      .order("created_at")
      .then(({ data }) => {
        if (!alive) return;
        const rows = (data || []).map((l) => ({
          key: key(),
          description: l.description,
          quantity: String(Number(l.quantity)),
          unit_price: Number(l.unit_price).toFixed(2),
          taxable: l.taxable,
        }));
        setLines(rows.length ? rows : [blank()]);
      });
    return () => {
      alive = false;
    };
  }, [request.id]);

  if (!lines) return <p className="small">Loading invoice…</p>;

  const irep = request.charge_to === "irep";
  const valid = lines.filter((l) => l.description.trim() || l.unit_price);
  const totals = invoiceTotals(
    valid.filter((l) => money2(l.unit_price) && Number(l.quantity) > 0),
    irep ? 0 : DEFAULT_HST_PERCENT
  );
  const set = (k, field, value) => {
    setLines((list) => list.map((l) => (l.key === k ? { ...l, [field]: value } : l)));
    setMsg({ kind: "", text: "" });
  };

  async function save(e) {
    e.preventDefault();
    for (const l of valid) {
      if (!l.description.trim()) return setMsg({ kind: "err", text: "Every line needs a description." });
      if (!(Number(l.quantity) > 0)) return setMsg({ kind: "err", text: `Enter a quantity for “${l.description}”.` });
      if (!money2(l.unit_price)) return setMsg({ kind: "err", text: `Enter the price for “${l.description}” in dollars, like 450 or 89.99.` });
    }
    setBusy(true);
    setMsg({ kind: "", text: "" });
    const sb = getBrowserClient();
    const del = await sb.from("work_order_lines").delete().eq("request_id", request.id);
    if (del.error) {
      setBusy(false);
      return setMsg({ kind: "err", text: "That didn't save. Try again." });
    }
    if (valid.length) {
      const ins = await sb.from("work_order_lines").insert(
        valid.map((l, i) => ({
          request_id: request.id,
          sort: i,
          description: l.description.trim(),
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
          taxable: !irep && l.taxable,
        }))
      );
      if (ins.error) {
        setBusy(false);
        return setMsg({ kind: "err", text: "The lines didn't save. Try again." });
      }
    }
    const changes = { invoice_notes: notes.trim() || null };
    if (valid.length) {
      changes.actual_cost = totals.total;
      if (request.partner_id) changes.partner_pay = totals.subtotal;
    }
    const { data, error } = await sb.from("maintenance_requests").update(changes).eq("id", request.id).select("*").single();
    setBusy(false);
    if (error) return setMsg({ kind: "err", text: "The lines saved, but the work order's cost didn't update. Save again." });
    setMsg({ kind: "ok", text: valid.length ? `Invoice saved. Actual cost is now ${money(totals.total)}.` : "Invoice saved." });
    onSaved?.(data);
  }

  return (
    <form className="stack" onSubmit={save} noValidate aria-label="Invoice">
      <p className="small">
        {invoiceNumber(request.invoice_no)} · Itemize the work for the landlord. Saving sets the actual cost to the total
        {irep ? " (IRep pays this one, so no HST is billed)" : " with HST"}
        {request.partner_id ? ", and the partner's price to the subtotal before HST" : ""}.
      </p>
      <div className="table-scroll">
        <table className="admin-table invoice-edit">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Qty</th>
              <th scope="col">Unit price ($)</th>
              {!irep ? <th scope="col">HST</th> : null}
              <th scope="col" className="r">
                Amount
              </th>
              <th scope="col">
                <span className="visually-hidden">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key}>
                <td>
                  <input
                    className="cell-input"
                    value={l.description}
                    onChange={(e) => set(l.key, "description", e.target.value)}
                    aria-label={`Line ${i + 1} item`}
                    placeholder="Labour: rebuild front stairs"
                  />
                </td>
                <td style={{ width: 80 }}>
                  <input
                    className="cell-input"
                    inputMode="decimal"
                    value={l.quantity}
                    onChange={(e) => set(l.key, "quantity", e.target.value)}
                    aria-label={`Line ${i + 1} quantity`}
                  />
                </td>
                <td style={{ width: 130 }}>
                  <input
                    className="cell-input"
                    inputMode="decimal"
                    value={l.unit_price}
                    onChange={(e) => set(l.key, "unit_price", e.target.value)}
                    aria-label={`Line ${i + 1} unit price`}
                  />
                </td>
                {!irep ? (
                  <td style={{ width: 60 }}>
                    <input
                      type="checkbox"
                      checked={l.taxable}
                      onChange={(e) => set(l.key, "taxable", e.target.checked)}
                      aria-label={`Line ${i + 1} HST`}
                    />
                  </td>
                ) : null}
                <td className="r num">
                  {money2(l.unit_price) && Number(l.quantity) > 0
                    ? money(Math.round(Number(l.quantity) * Number(l.unit_price) * 100) / 100)
                    : "—"}
                </td>
                <td>
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => setLines((list) => (list.length > 1 ? list.filter((x) => x.key !== l.key) : [blank()]))}
                  >
                    Remove<span className="visually-hidden"> line {i + 1}</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="req-actions" style={{ justifyContent: "space-between" }}>
        <button type="button" className="btn ghost sm" onClick={() => setLines((list) => [...list, blank()])}>
          Add a line
        </button>
        <span className="num">
          Subtotal {money(totals.subtotal)}
          {!irep ? ` · HST ${money(totals.hst)}` : ""} · <b>Total {money(totals.total)}</b>
        </span>
      </div>
      <div className="field">
        <label htmlFor={`${id}-notes`}>Note on the invoice (optional)</label>
        <textarea id={`${id}-notes`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Owner approved by phone Oct 19." />
        <span className="small">The landlord sees this.</span>
      </div>
      {msg.text ? (
        <div className={msg.kind === "err" ? "warnbox" : "okbox"} role={msg.kind === "err" ? "alert" : "status"}>
          {msg.text}
        </div>
      ) : null}
      <div className="req-actions">
        <button type="submit" className="btn primary sm" disabled={busy}>
          {busy ? "Saving…" : "Save invoice"}
        </button>
        <Link className="btn ghost sm" href={`/admin/maintenance/${request.id}/invoice`}>
          View / print invoice
        </Link>
      </div>
    </form>
  );
}
