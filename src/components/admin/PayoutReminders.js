"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { todayISO } from "@/lib/rent";

// Payouts still to send. Marking one sent records the landlord payout too (when it's for a property we manage).
export default function PayoutReminders({ compact = false }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ payee: "", amount: "", reason: "" });

  const load = useCallback(async () => {
    const { data, error: err } = await getBrowserClient()
      .from("payout_reminders")
      .select("*, property:properties(address)")
      .is("done_at", null)
      .order("created_at");
    if (err) return setRows([]);
    setRows(data || []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function markSent(r) {
    setBusy(r.id);
    setError("");
    const sb = getBrowserClient();
    let payoutId = null;
    if (r.property_id) {
      const { data, error: err } = await sb
        .from("owner_payouts")
        .insert({ property_id: r.property_id, period: r.period || `${todayISO().slice(0, 7)}-01`, paid_on: todayISO(), amount: r.amount, method: "etransfer", notes: r.reason })
        .select("id")
        .single();
      if (err) {
        setBusy("");
        return setError("The payout didn't save. Try again.");
      }
      payoutId = data.id;
    }
    await sb.from("payout_reminders").update({ done_at: new Date().toISOString(), owner_payout_id: payoutId }).eq("id", r.id);
    setBusy("");
    load();
  }

  async function add(e) {
    e.preventDefault();
    const amount = Number(f.amount);
    if (!f.payee.trim() || !(amount > 0) || !f.reason.trim()) return setError("Add who, how much and what it's for.");
    const { error: err } = await getBrowserClient().from("payout_reminders").insert({ payee: f.payee.trim(), amount, reason: f.reason.trim() });
    if (err) return setError("That didn't save. Try again.");
    setF({ payee: "", amount: "", reason: "" });
    setAdding(false);
    setError("");
    load();
  }

  if (!rows || (compact && !rows.length)) return null;
  const total = rows.reduce((t, r) => t + Number(r.amount), 0);

  return (
    <section className="boxed stack attention" aria-labelledby="payouts-to-send" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h2 id="payouts-to-send" className="sub-title" style={{ margin: 0 }}>
          Payouts to Send ({rows.length}) · {money(total)}
        </h2>
        {compact ? <Link className="small" href="/admin/payouts">Landlord Payouts →</Link> : null}
      </div>
      {rows.length ? (
        <ul className="plain-list" style={{ gap: 8 }}>
          {rows.map((r) => (
            <li key={r.id} className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span>
                <b>{r.payee}</b> · <span className="num">{money(r.amount)}</span>
                <span className="small sub-line">{r.reason}</span>
              </span>
              <button type="button" className="btn ghost sm" disabled={Boolean(busy)} onClick={() => markSent(r)}>
                {busy === r.id ? "Saving…" : "Mark Sent"}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small" style={{ margin: 0 }}>Nothing waiting to be sent.</p>
      )}
      {!compact ? (
        adding ? (
          <form className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "end" }} onSubmit={add}>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="pr-payee">To</label>
              <input id="pr-payee" value={f.payee} onChange={(e) => setF({ ...f, payee: e.target.value })} />
            </div>
            <div className="field" style={{ margin: 0, maxWidth: 120 }}>
              <label htmlFor="pr-amt">Amount</label>
              <input id="pr-amt" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
            </div>
            <div className="field" style={{ margin: 0, flex: "1 1 240px" }}>
              <label htmlFor="pr-why">What it&apos;s for</label>
              <input id="pr-why" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
            </div>
            <button className="btn sm" type="submit">Add</button>
          </form>
        ) : (
          <button type="button" className="link-btn small" style={{ justifySelf: "start" }} onClick={() => setAdding(true)}>
            Add a payout reminder
          </button>
        )
      ) : null}
      {error ? <div className="warnbox" role="alert">{error}</div> : null}
      <p className="small" style={{ margin: 0 }}>
        Marking a payout sent records it on that landlord&apos;s statement (dated today, by e-Transfer), so it matches the bank line later.
      </p>
    </section>
  );
}
