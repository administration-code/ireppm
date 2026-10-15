"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import {
  METHOD_LABEL,
  PAYMENT_KIND_LABEL,
  checkAmount,
  countUnmatched,
  loadTenancyOptions,
  periodOf,
  primaryTenant,
  todayISO,
} from "@/lib/rent";
import RentNav, { RentHead } from "./RentNav";
import TenancyPicker from "./TenancyPicker";

const blank = (tenancyId = "") => ({
  tenancyId,
  date: todayISO(),
  amount: "",
  method: "cash",
  kind: "rent",
  month: "",
  payer: "",
  receivedBy: "",
  notes: "",
});

export default function RecordPayment({ tenancyId = "" }) {
  const [tenancies, setTenancies] = useState([]);
  const [unmatched, setUnmatched] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(() => blank(tenancyId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([loadTenancyOptions(), countUnmatched()]).then(
      ([list, count]) => {
        if (!alive) return;
        setTenancies(list);
        setUnmatched(count);
      },
      (err) => alive && setLoadError(err.message)
    );
    return () => {
      alive = false;
    };
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.tenancyId) return setError("Choose the tenancy this payment is for.");
    if (!form.date) return setError("Add the date the payment was received.");
    const problem = checkAmount(form.amount);
    if (problem) return setError(problem);

    setBusy(true);
    const { data, error: insError } = await getBrowserClient()
      .from("payments")
      .insert({
        tenancy_id: form.tenancyId,
        received_on: form.date,
        amount: Math.round(Number(form.amount) * 100) / 100,
        method: form.method,
        kind: form.kind,
        period: periodOf(form.month),
        payer_name: form.payer.trim() || null,
        received_by: form.method === "cash" ? form.receivedBy.trim() || null : null,
        notes: form.notes.trim() || null,
        source: "manual",
      })
      .select("id, amount")
      .single();
    setBusy(false);
    if (insError || !data) return setError("That payment didn't save. Try again.");
    const t = tenancies.find((x) => x.id === form.tenancyId);
    setSaved({ id: data.id, text: `Saved ${money(data.amount)} from ${t ? primaryTenant(t) : "the tenant"}.` });
    setForm(blank());
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <RentHead title="Record a payment" intro="For cash, cheques, direct deposits and anything that didn't arrive by e-Transfer email." />
      <RentNav current="/admin/rent/new" unmatched={unmatched} />

      {loadError ? <div className="warnbox">{loadError}</div> : null}
      {saved ? (
        <div className="okbox" role="status">
          {saved.text} <Link href={`/admin/rent/receipt?payment=${saved.id}`}>View receipt</Link>
        </div>
      ) : null}

      <form className="boxed stack admin-form" onSubmit={submit} noValidate aria-label="Record a payment">
        <TenancyPicker
          id="rp-tenancy"
          tenancies={tenancies}
          value={form.tenancyId}
          onChange={(v) => setForm((f) => ({ ...f, tenancyId: v }))}
        />
        <div className="row3">
          <div className="field">
            <label htmlFor="rp-date">Date received</label>
            <input id="rp-date" type="date" value={form.date} onChange={set("date")} />
          </div>
          <div className="field">
            <label htmlFor="rp-amount">Amount</label>
            <input id="rp-amount" inputMode="decimal" value={form.amount} onChange={set("amount")} placeholder="1850" />
          </div>
          <div className="field">
            <label htmlFor="rp-method">Method</label>
            <select id="rp-method" value={form.method} onChange={set("method")}>
              {Object.entries(METHOD_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row3">
          <div className="field">
            <label htmlFor="rp-kind">What it&apos;s for</label>
            <select id="rp-kind" value={form.kind} onChange={set("kind")}>
              {Object.entries(PAYMENT_KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rp-month">Rent month</label>
            <input id="rp-month" type="month" value={form.month} onChange={set("month")} aria-describedby="rp-month-hint" />
            <span id="rp-month-hint" className="small">
              Leave blank to use the date received. On or after the 25th counts toward next month.
            </span>
          </div>
          <div className="field">
            <label htmlFor="rp-payer">Payer name (optional)</label>
            <input id="rp-payer" value={form.payer} onChange={set("payer")} />
          </div>
        </div>
        {form.method === "cash" ? (
          <div className="field">
            <label htmlFor="rp-by">Cash received by</label>
            <input id="rp-by" value={form.receivedBy} onChange={set("receivedBy")} placeholder="e.g. Chuck" />
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="rp-notes">Notes (optional)</label>
          <textarea id="rp-notes" rows={2} value={form.notes} onChange={set("notes")} />
        </div>
        {error ? (
          <div className="warnbox" role="alert">
            {error}
          </div>
        ) : null}
        <div className="req-actions">
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "Saving…" : "Save payment"}
          </button>
        </div>
      </form>
    </div>
  );
}
