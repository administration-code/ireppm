"use client";

import { useId, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { checkAmount, todayISO } from "@/lib/rent";
import { PAYOUT_METHOD_LABEL } from "@/lib/payouts";
import { lockedMessage } from "@/lib/accounting";

function toForm(payout, defaultAmount) {
  return {
    amount: payout ? String(payout.amount) : Number(defaultAmount) > 0 ? String(defaultAmount) : "",
    paid_on: payout?.paid_on || todayISO(),
    method: payout?.method || "etransfer",
    reference: payout?.reference || "",
    notes: payout?.notes || "",
  };
}

export default function PayoutForm({ propertyId, period, payout, defaultAmount, onSaved, onCancel }) {
  const id = useId();
  const [form, setForm] = useState(() => toForm(payout, defaultAmount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    const problem = checkAmount(form.amount, "payout amount") || (!form.paid_on ? "Add the date it was sent." : "");
    if (problem) return setError(problem);
    setSaving(true);
    setError("");
    const row = {
      amount: Number(form.amount),
      paid_on: form.paid_on,
      method: form.method,
      reference: form.reference.trim() || null,
      notes: form.notes.trim() || null,
    };
    const sb = getBrowserClient();
    const { data, error: err } = payout
      ? await sb.from("owner_payouts").update(row).eq("id", payout.id).select("id")
      : await sb
          .from("owner_payouts")
          .insert({ ...row, property_id: propertyId, period: `${period}-01` })
          .select("id");
    setSaving(false);
    if (err || !data?.length) return setError(lockedMessage(err, "That didn't save. Try again."));
    onSaved();
  }

  return (
    <form className="stack" onSubmit={save} noValidate>
      <div className="row3">
        <div className="field">
          <label htmlFor={`${id}-amt`}>Amount ($)</label>
          <input id={`${id}-amt`} inputMode="decimal" value={form.amount} onChange={set("amount")} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-date`}>Date sent</label>
          <input id={`${id}-date`} type="date" value={form.paid_on} onChange={set("paid_on")} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-method`}>Method</label>
          <select id={`${id}-method`} value={form.method} onChange={set("method")}>
            {Object.entries(PAYOUT_METHOD_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor={`${id}-ref`}>Reference</label>
          <input id={`${id}-ref`} value={form.reference} onChange={set("reference")} placeholder="e-Transfer reference number" />
        </div>
        <div className="field">
          <label htmlFor={`${id}-notes`}>Notes</label>
          <input id={`${id}-notes`} value={form.notes} onChange={set("notes")} />
        </div>
      </div>
      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}
      <div className="req-actions">
        <button type="submit" className="btn primary sm" disabled={saving}>
          {saving ? "Saving…" : payout ? "Save payout" : "Record payout"}
        </button>
        {onCancel ? (
          <button type="button" className="btn ghost sm" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
