"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { checkAmount, countUnmatched, loadTenancyOptions, monthLabel, primaryTenant, tenancyAddress, thisMonth, todayISO } from "@/lib/rent";
import RentNav, { RentHead } from "./RentNav";

async function loadBatch(month) {
  const sb = getBrowserClient();
  const period = `${month}-01`;
  await sb.rpc("generate_rent_charges", { p_month: period });
  const [tenancies, existing, unmatched] = await Promise.all([
    loadTenancyOptions({ includePast: false }),
    sb.from("payments").select("tenancy_id, amount").eq("method", "payprop").eq("period", period).eq("status", "matched"),
    countUnmatched(),
  ]);
  const already = {};
  (existing.data || []).forEach((p) => {
    already[p.tenancy_id] = (already[p.tenancy_id] || 0) + Number(p.amount);
  });
  return { tenancies, already, unmatched };
}

const rowsFor = (tenancies) =>
  Object.fromEntries(tenancies.map((t) => [t.id, { checked: false, amount: String(Number(t.rent || 0)), date: todayISO() }]));

export default function PayPropBatch() {
  const [month, setMonth] = useState(thisMonth);
  const [state, setState] = useState({ loading: true, tenancies: [], already: {}, unmatched: 0, error: "" });
  const [rows, setRows] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(month)) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    loadBatch(month).then(
      (data) => {
        if (!alive) return;
        setState({ loading: false, error: "", ...data });
        setRows(rowsFor(data.tenancies));
      },
      (err) => alive && setState((s) => ({ ...s, loading: false, error: err.message || "We couldn't load tenancies." }))
    );
    return () => {
      alive = false;
    };
  }, [month]);

  const { loading, tenancies, already, unmatched } = state;
  const setRow = (id, changes) => setRows((r) => ({ ...r, [id]: { ...r[id], ...changes } }));
  const picked = tenancies.filter((t) => rows[t.id]?.checked);

  async function save(e) {
    e.preventDefault();
    setError("");
    setSaved("");
    if (!picked.length) return setError("Tick at least one tenancy that paid through PayProp.");
    for (const t of picked) {
      const problem = checkAmount(rows[t.id].amount, `amount for ${primaryTenant(t)}`);
      if (problem) return setError(problem);
      if (!rows[t.id].date) return setError(`Add the date for ${primaryTenant(t)}.`);
    }
    setBusy(true);
    const { data, error: insError } = await getBrowserClient()
      .from("payments")
      .insert(
        picked.map((t) => ({
          tenancy_id: t.id,
          received_on: rows[t.id].date,
          amount: Math.round(Number(rows[t.id].amount) * 100) / 100,
          method: "payprop",
          kind: "rent",
          period: `${month}-01`,
          payer_name: primaryTenant(t),
          source: "payprop",
        }))
      )
      .select("id");
    if (insError || data?.length !== picked.length) {
      setBusy(false);
      return setError("The batch didn't save. Nothing was recorded — try again.");
    }
    const next = await loadBatch(month);
    setState({ loading: false, error: "", ...next });
    setRows(rowsFor(next.tenancies));
    setBusy(false);
    setSaved(`Saved ${picked.length} PayProp ${picked.length === 1 ? "payment" : "payments"} for ${monthLabel(`${month}-01`)}.`);
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <RentHead
        title="PayProp batch"
        intro="Until PayProp's API is connected, tick the tenants who paid through PayProp this month and save them in one go."
      />
      <RentNav current="/admin/rent/payprop" unmatched={unmatched} />

      <div className="filters">
        <div className="field" style={{ flex: "0 1 220px" }}>
          <label htmlFor="pp-month">Rent month</label>
          <input id="pp-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
      </div>

      {state.error ? <div className="warnbox">{state.error}</div> : null}
      {saved ? (
        <div className="okbox" role="status">
          {saved}
        </div>
      ) : null}

      <form className="boxed stack" onSubmit={save} noValidate aria-label="PayProp payments">
        {loading ? (
          <p className="small">Loading tenancies…</p>
        ) : !tenancies.length ? (
          <p className="small">There are no current tenancies.</p>
        ) : (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Paid</th>
                  <th scope="col">Tenant</th>
                  <th scope="col" className="r">Rent</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Date</th>
                </tr>
              </thead>
              <tbody>
                {tenancies.map((t) => {
                  const r = rows[t.id] || {};
                  const name = primaryTenant(t);
                  return (
                    <tr key={t.id} className={r.checked ? "editing-row" : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          className="row-check"
                          checked={Boolean(r.checked)}
                          onChange={(e) => setRow(t.id, { checked: e.target.checked })}
                          aria-label={`${name} paid through PayProp`}
                        />
                      </td>
                      <td>
                        <b>{name}</b>
                        <span className="sub-line small">{tenancyAddress(t)}</span>
                        {already[t.id] ? (
                          <span className="sub-line small ok">Already recorded {money(already[t.id])} via PayProp</span>
                        ) : null}
                      </td>
                      <td className="r num">{money(t.rent)}</td>
                      <td>
                        <input
                          className="cell-input"
                          inputMode="decimal"
                          value={r.amount || ""}
                          onChange={(e) => setRow(t.id, { amount: e.target.value })}
                          aria-label={`Amount for ${name}`}
                          disabled={!r.checked}
                        />
                      </td>
                      <td>
                        <input
                          className="cell-input"
                          type="date"
                          value={r.date || ""}
                          onChange={(e) => setRow(t.id, { date: e.target.value })}
                          aria-label={`Date for ${name}`}
                          disabled={!r.checked}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {error ? (
          <div className="warnbox" role="alert">
            {error}
          </div>
        ) : null}
        <div className="req-actions">
          <button type="submit" className="btn primary" disabled={busy || loading}>
            {busy ? "Saving…" : `Save ${picked.length || ""} PayProp ${picked.length === 1 ? "payment" : "payments"}`}
          </button>
        </div>
      </form>
    </div>
  );
}
