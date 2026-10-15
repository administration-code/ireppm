"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import {
  METHOD_LABEL,
  PAYMENT_KIND_LABEL,
  cents,
  checkAmount,
  loadTenancyOptions,
  periodOf,
  savePayment,
  shortDate,
  tenancyAddress,
  primaryTenant,
} from "@/lib/rent";
import RentNav, { RentHead } from "./RentNav";
import TenancyPicker from "./TenancyPicker";

const PAYMENT_SELECT =
  "id, received_on, amount, method, kind, period, payer_name, memo, reference, source, suggested_tenancy_id, status, notes, created_at";

async function loadToMatch() {
  const [payments, tenancies] = await Promise.all([
    getBrowserClient()
      .from("payments")
      .select(PAYMENT_SELECT)
      .eq("status", "unmatched")
      .order("received_on", { ascending: false })
      .order("created_at", { ascending: false }),
    loadTenancyOptions(),
  ]);
  if (payments.error) throw new Error("load failed");
  return { payments: payments.data || [], tenancies };
}

export default function MatchPayments() {
  const [state, setState] = useState({ loading: true, payments: [], tenancies: [], error: "" });
  const [done, setDone] = useState("");

  useEffect(() => {
    let alive = true;
    loadToMatch().then(
      (data) => alive && setState({ loading: false, error: "", ...data }),
      () => alive && setState((s) => ({ ...s, loading: false, error: "We couldn't load payments. Refresh the page to try again." }))
    );
    return () => {
      alive = false;
    };
  }, []);

  const finish = (id, message) => {
    setState((s) => ({ ...s, payments: s.payments.filter((p) => p.id !== id) }));
    setDone(message);
  };

  const { loading, payments, tenancies, error } = state;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <RentHead
        title="To match"
        intro="Payments we couldn't tie to a tenancy automatically. Once you match an e-Transfer, we remember the sender's name for next time."
      />
      <RentNav current="/admin/rent/match" unmatched={payments.length} />

      {error ? <div className="warnbox">{error}</div> : null}
      {done ? (
        <div className="okbox" role="status">
          {done}
        </div>
      ) : null}

      {loading ? (
        <p className="small">Loading payments…</p>
      ) : !payments.length && !error ? (
        <div className="empty">
          <h2>All caught up</h2>
          <p>Every payment is matched to a tenancy.</p>
        </div>
      ) : (
        <ul className="req-list">
          {payments.map((p) => (
            <MatchCard key={p.id} payment={p} tenancies={tenancies} onDone={finish} />
          ))}
        </ul>
      )}
    </div>
  );
}

const newSplitRow = (month) => ({ key: Math.random().toString(36).slice(2), tenancyId: "", amount: "", month });

function MatchCard({ payment, tenancies, onDone }) {
  const defaultMonth = String(payment.period || payment.received_on).slice(0, 7);
  const suggested = tenancies.find((t) => t.id === payment.suggested_tenancy_id);
  const [mode, setMode] = useState("");
  const [tenancyId, setTenancyId] = useState("");
  const [month, setMonth] = useState(defaultMonth);
  const [kind, setKind] = useState(payment.kind || "rent");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState(() => [newSplitRow(defaultMonth), newSplitRow(defaultMonth)]);
  const [receivedBy, setReceivedBy] = useState("Chuck");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const describe = `${money(payment.amount)} from ${payment.payer_name || "unknown sender"}`;

  async function run(action, message) {
    setBusy(true);
    setError("");
    try {
      await action();
      onDone(payment.id, message);
    } catch (err) {
      setError(err.message || "That didn't save. Try again.");
      setBusy(false);
    }
  }

  const match = (id) => {
    if (!id) return setError("Choose the tenancy this payment is for.");
    if (!month && kind === "rent") return setError("Choose the rent month this pays for.");
    const t = tenancies.find((x) => x.id === id);
    return run(
      () => savePayment(payment.id, { tenancy_id: id, kind, period: periodOf(month) }),
      `Matched ${describe} to ${t ? primaryTenant(t) : "the tenancy"}.`
    );
  };

  const ignore = (e) => {
    e.preventDefault();
    if (!note.trim()) return setError("Add a short note saying what this payment is.");
    return run(() => savePayment(payment.id, { status: "ignored", notes: note.trim() }), `Marked ${describe} as not rent.`);
  };

  const splitTotal = rows.reduce((s, r) => s + cents(r.amount), 0);
  const remaining = cents(payment.amount) - splitTotal;

  const saveSplit = (e) => {
    e.preventDefault();
    for (const r of rows) {
      if (!r.tenancyId) return setError("Choose a tenancy on every row.");
      const problem = checkAmount(r.amount);
      if (problem) return setError(problem);
      if (!r.month) return setError("Choose the rent month on every row.");
    }
    if (remaining !== 0) return setError(`The rows must add up to ${money(payment.amount)}.`);

    return run(async () => {
      const sb = getBrowserClient();
      const children = rows.map((r) => ({
        tenancy_id: r.tenancyId,
        amount: cents(r.amount) / 100,
        period: periodOf(r.month),
        received_on: payment.received_on,
        method: "cash",
        kind: "rent",
        source: "split",
        received_by: receivedBy.trim() || null,
        payer_name: payment.payer_name,
        parent_id: payment.id,
      }));
      const { data, error: insError } = await sb.from("payments").insert(children).select("id");
      if (insError || data?.length !== children.length) throw new Error("The split didn't save. Try again.");
      try {
        await savePayment(payment.id, { status: "split" });
      } catch (err) {
        await sb.from("payments").delete().in("id", data.map((d) => d.id));
        throw err;
      }
    }, `Split ${describe} across ${rows.length} tenancies.`);
  };

  const setRow = (key, changes) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...changes } : r)));

  return (
    <li className="req stack">
      <div className="req-top">
        <b className="num">
          {money(payment.amount)} <span className="small">· {shortDate(payment.received_on)}</span>
        </b>
        <span className="pill req">{METHOD_LABEL[payment.method] || payment.method}</span>
      </div>
      <dl className="req-facts">
        <div>
          <dt>Payer</dt>
          <dd>{payment.payer_name || "Not given"}</dd>
        </div>
        <div>
          <dt>Message</dt>
          <dd>{payment.memo || "—"}</dd>
        </div>
        {payment.reference ? (
          <div>
            <dt>Reference</dt>
            <dd>{payment.reference}</dd>
          </div>
        ) : null}
      </dl>

      {suggested && !mode ? (
        <div className="suggest">
          <p>
            Looks like <b>{primaryTenant(suggested)}</b>, {tenancyAddress(suggested)}
          </p>
          <button type="button" className="btn primary sm" onClick={() => match(suggested.id)} disabled={busy}>
            {busy ? "Saving…" : "Confirm"}
          </button>
        </div>
      ) : null}

      {mode === "" ? (
        <div className="stack">
          <TenancyPicker id={`t-${payment.id}`} tenancies={tenancies} value={tenancyId} onChange={setTenancyId} />
          <div className="row2">
            <div className="field">
              <label htmlFor={`k-${payment.id}`}>What it&apos;s for</label>
              <select id={`k-${payment.id}`} value={kind} onChange={(e) => setKind(e.target.value)}>
                {Object.entries(PAYMENT_KIND_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`m-${payment.id}`}>Rent month</label>
              <input id={`m-${payment.id}`} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
          </div>
          <div className="req-actions">
            <button type="button" className="btn primary sm" onClick={() => match(tenancyId)} disabled={busy}>
              {busy ? "Saving…" : "Match"}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => (setError(""), setMode("split"))} disabled={busy}>
              Split
            </button>
            <button type="button" className="btn ghost sm" onClick={() => (setError(""), setMode("ignore"))} disabled={busy}>
              Ignore (not rent)
            </button>
          </div>
        </div>
      ) : mode === "ignore" ? (
        <form className="confirm-box stack" onSubmit={ignore} noValidate aria-label="Ignore this payment">
          <div className="field">
            <label htmlFor={`n-${payment.id}`}>What is this payment?</label>
            <input
              id={`n-${payment.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Owner top-up, refund, sent by mistake"
            />
          </div>
          <div className="req-actions">
            <button type="submit" className="btn primary sm" disabled={busy}>
              {busy ? "Saving…" : "Ignore payment"}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setMode("")} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <form className="confirm-box stack" onSubmit={saveSplit} noValidate aria-label="Split this payment">
          <p className="small">
            Use this for a lump sum, like cash collected from several tenants and sent as one e-Transfer. Each row
            becomes its own cash payment.
          </p>
          {rows.map((r, i) => (
            <fieldset key={r.key} className="split-row">
              <legend className="small">Row {i + 1}</legend>
              <TenancyPicker
                id={`s-${payment.id}-${r.key}`}
                tenancies={tenancies}
                value={r.tenancyId}
                onChange={(v) => setRow(r.key, { tenancyId: v })}
              />
              <div className="row3">
                <div className="field">
                  <label htmlFor={`sa-${r.key}`}>Amount</label>
                  <input
                    id={`sa-${r.key}`}
                    inputMode="decimal"
                    value={r.amount}
                    onChange={(e) => setRow(r.key, { amount: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`sm-${r.key}`}>Rent month</label>
                  <input id={`sm-${r.key}`} type="month" value={r.month} onChange={(e) => setRow(r.key, { month: e.target.value })} />
                </div>
                <div className="field split-remove">
                  {rows.length > 2 ? (
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                    >
                      Remove row
                    </button>
                  ) : null}
                </div>
              </div>
            </fieldset>
          ))}
          <div className="row2">
            <div className="field">
              <label htmlFor={`rb-${payment.id}`}>Cash received by</label>
              <input id={`rb-${payment.id}`} value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} />
            </div>
            <p className={`small split-sum${remaining ? " err" : " ok"}`} aria-live="polite">
              {money(splitTotal / 100)} of {money(payment.amount)}
              {remaining ? ` · ${money(Math.abs(remaining) / 100)} ${remaining > 0 ? "left to assign" : "too much"}` : " · adds up"}
            </p>
          </div>
          <div className="req-actions">
            <button type="button" className="btn ghost sm" onClick={() => setRows((list) => [...list, newSplitRow(defaultMonth)])}>
              Add a row
            </button>
            <button type="submit" className="btn primary sm" disabled={busy}>
              {busy ? "Saving…" : "Save split"}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setMode("")} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}
    </li>
  );
}
