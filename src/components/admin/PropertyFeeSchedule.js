"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { monthLabel, thisMonth } from "@/lib/rent";

const TYPES = {
  locked: "Locked 1-year rate",
  standard: "Standard rate",
  base: "Base rate",
  custom: "Custom rate",
  before_schedule: "Fee before the schedule",
};

const nextMonth = () => {
  const [y, m] = thisMonth().split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

// Staff: management-fee changes with the month they take effect. Statements and payouts use the
// fee in force for each month; the property's fee updates itself when a change starts.
export default function PropertyFeeSchedule({ propertyId, currentFee }) {
  const [rows, setRows] = useState(null);
  const [f, setF] = useState({ effective: nextMonth(), type: "standard", amount: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });

  const load = useCallback(async () => {
    const { data } = await getBrowserClient()
      .from("property_fee_changes")
      .select("id, effective_month, rate_type, amount, note")
      .eq("property_id", propertyId)
      .order("effective_month", { ascending: false });
    setRows(data || []);
  }, [propertyId]);
  useEffect(() => {
    load();
  }, [load]);

  async function add(e) {
    e.preventDefault();
    const amt = String(f.amount).trim();
    if (!/^\d{4}-\d{2}$/.test(f.effective)) return setMsg({ kind: "err", text: "Choose the month it starts." });
    if (!/^\d+(\.\d{1,2})?$/.test(amt)) return setMsg({ kind: "err", text: "Enter the monthly fee in dollars, like 200." });
    setBusy(true);
    const { error } = await getBrowserClient()
      .from("property_fee_changes")
      .insert({ property_id: propertyId, effective_month: `${f.effective}-01`, rate_type: f.type, amount: Number(amt), note: f.note.trim() || null });
    setBusy(false);
    if (error) return setMsg({ kind: "err", text: /duplicate|unique/i.test(error.message) ? "There's already a change for that month. Delete it first." : error.message });
    setMsg({ kind: "ok", text: `Saved. From ${monthLabel(`${f.effective}-01`)} the fee is ${money(Number(amt))} a month.` });
    setF((s) => ({ ...s, amount: "", note: "" }));
    load();
  }

  async function remove(r) {
    if (!window.confirm(`Delete the ${monthLabel(r.effective_month)} fee change?`)) return;
    const { error } = await getBrowserClient().from("property_fee_changes").delete().eq("id", r.id);
    if (error) return setMsg({ kind: "err", text: error.message });
    load();
  }

  const now = `${thisMonth()}-01`;
  const inForce = (rows || []).find((r) => r.effective_month <= now);

  return (
    <section className="boxed stack" aria-labelledby="sec-fee-sched">
      <h2 id="sec-fee-sched" className="sec-title">
        Management Fee Changes
      </h2>
      <p className="small" style={{ margin: 0 }}>
        Schedule a new monthly fee (the end of a locked 1-year rate, the standard rate, or a new base) with the month it starts. Statements and
        payouts switch on their own that month. Months before keep the old fee. Current fee: <b>{money(inForce ? inForce.amount : currentFee)}</b>.
      </p>
      {rows?.filter((r) => r.rate_type !== "before_schedule").length ? (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">From</th>
                <th scope="col">Rate</th>
                <th scope="col" className="r">Monthly fee</th>
                <th scope="col">Note</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.rate_type === "before_schedule" ? "Before" : monthLabel(r.effective_month)}</td>
                  <td>
                    {TYPES[r.rate_type] || r.rate_type}
                    {r === inForce ? <span className="pill ts-active" style={{ marginLeft: 6 }}>In force</span> : null}
                  </td>
                  <td className="r num">{money(r.amount)}</td>
                  <td className="small">{r.note || ""}</td>
                  <td className="r">
                    {r.effective_month > now ? (
                      <button type="button" className="link-btn small" onClick={() => remove(r)}>
                        Delete
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <form className="row4" onSubmit={add} noValidate style={{ alignItems: "end" }}>
        <div className="field">
          <label htmlFor="fs-month">Starts</label>
          <input id="fs-month" type="month" value={f.effective} onChange={(e) => setF((s) => ({ ...s, effective: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="fs-type">Rate</label>
          <select id="fs-type" value={f.type} onChange={(e) => setF((s) => ({ ...s, type: e.target.value }))}>
            {["locked", "standard", "base", "custom"].map((k) => (
              <option key={k} value={k}>
                {TYPES[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="fs-amt">Monthly fee ($)</label>
          <input id="fs-amt" inputMode="decimal" value={f.amount} onChange={(e) => setF((s) => ({ ...s, amount: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="fs-note">Note (optional)</label>
          <input id="fs-note" value={f.note} onChange={(e) => setF((s) => ({ ...s, note: e.target.value }))} placeholder="Locked rate ends" />
        </div>
        <div>
          <button type="submit" className="btn primary sm" disabled={busy}>
            {busy ? "Saving…" : "Schedule Change"}
          </button>
        </div>
      </form>
      {msg.text ? <div className={msg.kind === "err" ? "warnbox" : "okbox"}>{msg.text}</div> : null}
    </section>
  );
}
