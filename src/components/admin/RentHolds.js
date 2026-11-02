"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { checkAmount, cents, monthLabel, shortDate, todayISO } from "@/lib/rent";

const HOLD_SELECT = "id, property_id, period, amount, description, tenancy_id, created_at, property:properties(address)";

export async function loadOpenHolds(propertyId) {
  let q = getBrowserClient()
    .from("statement_items")
    .select(HOLD_SELECT)
    .eq("kind", "rent_hold")
    .eq("hold_status", "held")
    .order("period");
  if (propertyId) q = q.eq("property_id", propertyId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

const ym = (d) => String(d).slice(0, 7);

// Hold some of this month's rent back from the owner (e.g. waiting on an N11 or the landlord's decision).
export function HoldRentForm({ propertyId, period, rentRows, onSaved }) {
  const id = useId();
  const [paymentId, setPaymentId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const choose = (pid) => {
    setPaymentId(pid);
    const p = rentRows.find((r) => (r.payment_id || r.id) === pid);
    if (p) setAmount(String(Number(p.amount)));
  };

  async function save(e) {
    e.preventDefault();
    const problem = checkAmount(amount) || (!reason.trim() ? "Say why it's held, like “Tenant leaving Nov 7: waiting on N11 and landlord's decision”." : "");
    if (problem) return setError(problem);
    const p = rentRows.find((r) => (r.payment_id || r.id) === paymentId);
    const who = p ? p.tenant || p.payer_name : null;
    setBusy(true);
    setError("");
    const { error: err } = await getBrowserClient()
      .from("statement_items")
      .insert({
        property_id: propertyId,
        period: `${period}-01`,
        kind: "rent_hold",
        amount: -cents(amount) / 100,
        description: `Held: ${who ? `${who}'s ` : ""}${monthLabel(`${period}-01`)} rent (${reason.trim()})`,
        tenancy_id: p?.tenancy_id || null,
        hold_status: "held",
      });
    setBusy(false);
    if (err) return setError("That didn't save. Try again.");
    setPaymentId("");
    setAmount("");
    setReason("");
    onSaved();
  }

  return (
    <form className="stack" onSubmit={save} noValidate>
      <p className="small">
        The held amount comes off this statement, so it isn&apos;t paid out. It shows on the landlord&apos;s letter as held. When
        it&apos;s decided, settle it below: release some or all to the landlord, and record any refund to the tenant.
      </p>
      <div className="row3">
        <div className="field">
          <label htmlFor={`${id}-pay`}>Rent payment</label>
          <select id={`${id}-pay`} value={paymentId} onChange={(e) => choose(e.target.value)}>
            <option value="">Choose (optional)</option>
            {rentRows.map((r) => (
              <option key={r.payment_id || r.id} value={r.payment_id || r.id}>
                {r.tenant || r.payer_name || "Tenant"} · {r.unit_label || ""} · {money(r.amount)} on {shortDate(r.received_on)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-amt`}>Amount to hold ($)</label>
          <input id={`${id}-amt`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-why`}>Reason</label>
          <input
            id={`${id}-why`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Waiting on N11 and landlord's decision"
          />
        </div>
      </div>
      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}
      <div className="req-actions">
        <button type="submit" className="btn primary sm" disabled={busy}>
          {busy ? "Saving…" : "Hold rent"}
        </button>
      </div>
    </form>
  );
}

function SettleForm({ hold, onSaved, onCancel }) {
  const id = useId();
  const held = Math.abs(cents(hold.amount));
  const [release, setRelease] = useState((held / 100).toFixed(2));
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [refundedOn, setRefundedOn] = useState(todayISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rel = /^\d+(\.\d{1,2})?$/.test(String(release).trim()) ? cents(release) : NaN;
  const refund = Number.isNaN(rel) ? 0 : held - rel;

  async function save(e) {
    e.preventDefault();
    if (Number.isNaN(rel) || rel < 0 || rel > held) return setError(`Enter an amount from $0 to ${money(held / 100)}.`);
    if (!note.trim()) return setError("Add a short note, like “Landlord approved refund of $600; kept $500 for damages”.");
    setBusy(true);
    setError("");
    const sb = getBrowserClient();
    if (rel > 0) {
      const { error: err } = await sb.from("statement_items").insert({
        property_id: hold.property_id,
        period: `${month}-01`,
        kind: "rent_hold",
        amount: rel / 100,
        description: `Released: ${hold.description.replace(/^Held:\s*/, "")}`,
        tenancy_id: hold.tenancy_id,
        hold_of: hold.id,
      });
      if (err) {
        setBusy(false);
        return setError("That didn't save. Try again.");
      }
    }
    const { error: err2 } = await sb
      .from("statement_items")
      .update({
        hold_status: "settled",
        refunded_amount: refund / 100,
        refunded_on: refund > 0 ? refundedOn : null,
        settled_at: new Date().toISOString(),
        settle_note: note.trim(),
      })
      .eq("id", hold.id);
    setBusy(false);
    if (err2) return setError("The release saved but the hold didn't update. Refresh and check before trying again.");
    onSaved();
  }

  return (
    <form className="confirm-box stack" onSubmit={save} noValidate>
      <div className="row3">
        <div className="field">
          <label htmlFor={`${id}-rel`}>Release to landlord ($)</label>
          <input id={`${id}-rel`} inputMode="decimal" value={release} onChange={(e) => setRelease(e.target.value)} />
          <span className="small">
            {Number.isNaN(rel) || rel < 0 || rel > held
              ? `Up to ${money(held / 100)}`
              : refund > 0
                ? `${money(refund / 100)} refunded to the tenant`
                : "Nothing refunded to the tenant"}
          </span>
        </div>
        <div className="field">
          <label htmlFor={`${id}-mo`}>Add to the landlord&apos;s statement for</label>
          <input id={`${id}-mo`} type="month" value={month} onChange={(e) => setMonth(e.target.value)} disabled={rel === 0} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-ref`}>Refund sent on</label>
          <input id={`${id}-ref`} type="date" value={refundedOn} onChange={(e) => setRefundedOn(e.target.value)} disabled={!(refund > 0)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${id}-note`}>Note</label>
        <input id={`${id}-note`} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}
      <div className="req-actions">
        <button type="submit" className="btn primary sm" disabled={busy}>
          {busy ? "Saving…" : "Settle hold"}
        </button>
        <button type="button" className="btn ghost sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// Open holds for one property (statement page) with a Settle action.
export function OpenHolds({ propertyId, refreshKey, onChanged }) {
  const [holds, setHolds] = useState(null);
  const [open, setOpen] = useState("");
  const load = useCallback(() => loadOpenHolds(propertyId).then(setHolds, () => setHolds([])), [propertyId]);
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (!holds) return <p className="small">Loading holds…</p>;
  if (!holds.length) return <p className="small">No rent is on hold for this property.</p>;
  return (
    <ul className="plain-list stack">
      {holds.map((h) => (
        <li key={h.id} className="stack" style={{ gap: 8 }}>
          <div className="req-actions" style={{ justifyContent: "space-between" }}>
            <span>
              <b>{money(Math.abs(Number(h.amount)))}</b> held on the {monthLabel(h.period)} statement
              <span className="small sub-line">{h.description}</span>
            </span>
            {open !== h.id ? (
              <button type="button" className="btn ghost sm" onClick={() => setOpen(h.id)}>
                Settle
              </button>
            ) : null}
          </div>
          {open === h.id ? (
            <SettleForm
              hold={h}
              onCancel={() => setOpen("")}
              onSaved={() => {
                setOpen("");
                load();
                onChanged?.();
              }}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

// Every open hold, for the Landlord Payouts page.
export function HoldsBanner() {
  const [holds, setHolds] = useState([]);
  useEffect(() => {
    loadOpenHolds().then(setHolds, () => setHolds([]));
  }, []);
  if (!holds.length) return null;
  return (
    <section className="warnbox stack" style={{ gap: 6 }} aria-label="Rent on hold">
      <b>Rent on hold ({money(holds.reduce((s, h) => s + Math.abs(cents(h.amount)), 0) / 100)})</b>
      <ul className="plain-list">
        {holds.map((h) => (
          <li key={h.id}>
            <Link href={`/admin/payouts/${h.property_id}/${ym(h.period)}`}>{h.property?.address}</Link>: {money(Math.abs(Number(h.amount)))} ·{" "}
            <span className="small">{h.description}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
