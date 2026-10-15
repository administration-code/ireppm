"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import {
  CHARGE_KIND_LABEL,
  MANUAL_CHARGE_KINDS,
  METHOD_LABEL,
  PAYMENT_KIND_LABEL,
  cents,
  checkAmount,
  monthLabel,
  periodOf,
  savePayment,
  shortDate,
  thisMonth,
  todayISO,
} from "@/lib/rent";

const CHARGE_FIELDS = "id, period, kind, description, amount, maintenance_request_id, created_at";
const PAYMENT_FIELDS = "id, received_on, amount, method, kind, period, payer_name, received_by, source, status, notes, created_at";

// Matches tenancy_balances: every charge, and matched rent payments only.
const countsTowardBalance = (p) => p.status === "matched" && p.kind === "rent";

async function loadLedger(tenancyId) {
  const sb = getBrowserClient();
  const [c, p] = await Promise.all([
    sb.from("rent_charges").select(CHARGE_FIELDS).eq("tenancy_id", tenancyId),
    sb.from("payments").select(PAYMENT_FIELDS).eq("tenancy_id", tenancyId),
  ]);
  if (c.error || p.error) throw new Error("We couldn't load the rent ledger. Refresh the page to try again.");
  const entries = [
    ...(c.data || []).map((x) => ({ type: "charge", key: `c-${x.id}`, date: x.period, row: x })),
    ...(p.data || []).map((x) => ({ type: "payment", key: `p-${x.id}`, date: x.received_on, row: x })),
  ].sort(
    (a, b) =>
      String(a.date).localeCompare(String(b.date)) ||
      Number(a.type === "payment") - Number(b.type === "payment") ||
      String(a.row.created_at).localeCompare(String(b.row.created_at))
  );
  let running = 0;
  return entries.map((e) => {
    if (e.type === "charge") running += cents(e.row.amount);
    else if (countsTowardBalance(e.row)) running -= cents(e.row.amount);
    return { ...e, balance: running / 100 };
  });
}

const chargeLabel = (c) => c.description || `${CHARGE_KIND_LABEL[c.kind] || "Charge"}, ${monthLabel(c.period)}`;

function paymentLabel(p) {
  const parts = [METHOD_LABEL[p.method] || p.method];
  parts.push(p.kind === "rent" ? `for ${monthLabel(p.period)}` : PAYMENT_KIND_LABEL[p.kind]);
  if (p.received_by) parts.push(`received by ${p.received_by}`);
  return parts.join(" · ");
}

export default function RentLedger({ tenancy }) {
  const [state, setState] = useState({ loading: true, entries: [], error: "" });
  const [editing, setEditing] = useState("");
  const [deleting, setDeleting] = useState("");
  const [adding, setAdding] = useState(false);
  const [range, setRange] = useState(() => ({ from: `${thisMonth()}-01`, to: todayISO() }));

  const reload = useCallback(async () => {
    try {
      setState({ loading: false, entries: await loadLedger(tenancy.id), error: "" });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, [tenancy.id]);

  useEffect(() => {
    let alive = true;
    loadLedger(tenancy.id).then(
      (entries) => alive && setState({ loading: false, entries, error: "" }),
      (err) => alive && setState({ loading: false, entries: [], error: err.message })
    );
    return () => {
      alive = false;
    };
  }, [tenancy.id]);

  const { loading, entries, error } = state;
  const balance = entries.length ? entries[entries.length - 1].balance : 0;

  async function remove(entry) {
    const table = entry.type === "charge" ? "rent_charges" : "payments";
    const { data, error: delError } = await getBrowserClient().from(table).delete().eq("id", entry.row.id).select("id");
    setDeleting("");
    if (delError || !data?.length) return setState((s) => ({ ...s, error: "That didn't delete. Try again." }));
    return reload();
  }

  const receiptHref = `/admin/rent/receipt?tenancy=${tenancy.id}&from=${range.from}&to=${range.to}`;

  return (
    <section className="boxed stack" aria-labelledby={`ledger-${tenancy.id}`}>
      <div className="req-top">
        <h2 id={`ledger-${tenancy.id}`} className="sec-title">
          Rent ledger
        </h2>
        {!loading ? (
          <span className={`num ledger-balance${cents(balance) > 0 ? " owing" : ""}`}>
            {cents(balance) > 0 ? `Owes ${money(balance)}` : cents(balance) < 0 ? `In credit ${money(-balance)}` : "Paid up"}
          </span>
        ) : null}
      </div>

      {error ? <div className="warnbox">{error}</div> : null}

      {loading ? (
        <p className="small">Loading the ledger…</p>
      ) : !entries.length ? (
        <p className="small">No charges or payments yet. Rent charges are added when a month opens on the Rent page.</p>
      ) : (
        <div className="table-scroll">
          <table className="admin-table ledger-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Item</th>
                <th scope="col" className="r">Charge</th>
                <th scope="col" className="r">Payment</th>
                <th scope="col" className="r">Balance</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const isCharge = e.type === "charge";
                const counted = isCharge || countsTowardBalance(e.row);
                return (
                  <Fragment key={e.key}>
                    <tr className={!counted ? "muted-row" : undefined}>
                      <td>{shortDate(e.date)}</td>
                      <td>
                        {isCharge ? chargeLabel(e.row) : paymentLabel(e.row)}
                        {!isCharge && !counted ? (
                          <span className="sub-line small">
                            {e.row.status === "matched" ? "Held, not counted toward rent" : `Not counted (${e.row.status})`}
                          </span>
                        ) : null}
                        {e.row.notes ? <span className="sub-line small">{e.row.notes}</span> : null}
                      </td>
                      <td className="r num">{isCharge ? money(e.row.amount) : ""}</td>
                      <td className="r num">{isCharge ? "" : money(e.row.amount)}</td>
                      <td className={`r num${cents(e.balance) > 0 ? " owing" : ""}`}>{money(e.balance)}</td>
                      <td>
                        <div className="row-actions">
                          {!isCharge && !["split", "ignored"].includes(e.row.status) ? (
                            <Link href={`/admin/rent/receipt?payment=${e.row.id}`}>Receipt</Link>
                          ) : null}
                          <button type="button" className="link-btn" onClick={() => (setDeleting(""), setEditing(e.key))}>
                            Edit
                          </button>
                          <button type="button" className="link-btn" onClick={() => (setEditing(""), setDeleting(e.key))}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    {deleting === e.key ? (
                      <tr className="editing-row">
                        <td colSpan={6}>
                          <div className="req-actions">
                            <span>
                              <b>Delete this {isCharge ? "charge" : "payment"}?</b> This can&apos;t be undone.
                            </span>
                            <button type="button" className="btn primary sm" onClick={() => remove(e)}>
                              Yes, delete
                            </button>
                            <button type="button" className="btn ghost sm" onClick={() => setDeleting("")}>
                              Keep it
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    {editing === e.key ? (
                      <tr className="editing-row">
                        <td colSpan={6}>
                          {isCharge ? (
                            <ChargeForm
                              tenancyId={tenancy.id}
                              charge={e.row}
                              onCancel={() => setEditing("")}
                              onSaved={async () => {
                                setEditing("");
                                await reload();
                              }}
                            />
                          ) : (
                            <PaymentEditForm
                              payment={e.row}
                              onCancel={() => setEditing("")}
                              onSaved={async () => {
                                setEditing("");
                                await reload();
                              }}
                            />
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {adding ? (
        <div className="confirm-box">
          <ChargeForm
            tenancyId={tenancy.id}
            onCancel={() => setAdding(false)}
            onSaved={async () => {
              setAdding(false);
              await reload();
            }}
          />
        </div>
      ) : (
        <div className="req-actions">
          <button type="button" className="btn ghost sm" onClick={() => setAdding(true)}>
            Add a charge
          </button>
          <Link className="btn ghost sm" href={`/admin/rent/new?tenancy=${tenancy.id}`}>
            Record a payment
          </Link>
        </div>
      )}

      <div className="range-receipt">
        <span className="label-text">Receipt for a date range</span>
        <div className="row3">
          <div className="field">
            <label htmlFor={`rr-from-${tenancy.id}`}>From</label>
            <input
              id={`rr-from-${tenancy.id}`}
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor={`rr-to-${tenancy.id}`}>To</label>
            <input
              id={`rr-to-${tenancy.id}`}
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            />
          </div>
          <div className="field split-remove">
            {range.from && range.to && range.from <= range.to ? (
              <Link className="btn ghost sm" href={receiptHref}>
                Make receipt
              </Link>
            ) : (
              <span className="small err">Pick a start date before the end date.</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ChargeForm({ tenancyId, charge, onCancel, onSaved }) {
  const isRent = charge?.kind === "rent";
  const [form, setForm] = useState(() => ({
    kind: charge?.kind || "opening_balance",
    month: String(charge?.period || `${thisMonth()}-01`).slice(0, 7),
    description: charge?.description || "",
    amount: charge ? String(Number(charge.amount)) : "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    const problem = checkAmount(form.amount, "amount", { allowNegative: true });
    if (problem) return setError(problem);
    if (!form.month) return setError("Choose the month this charge belongs to.");
    setBusy(true);
    setError("");
    const row = {
      period: periodOf(form.month),
      description: form.description.trim() || null,
      amount: Math.round(Number(form.amount) * 100) / 100,
      ...(isRent ? {} : { kind: form.kind }),
    };
    const sb = getBrowserClient().from("rent_charges");
    const { data, error: saveError } = charge
      ? await sb.update(row).eq("id", charge.id).select("id")
      : await sb.insert({ ...row, tenancy_id: tenancyId }).select("id");
    setBusy(false);
    if (saveError?.code === "23505") return setError("There's already a rent charge for that month.");
    if (saveError || !data?.length) return setError("That charge didn't save. Try again.");
    return onSaved();
  }

  return (
    <form className="stack" onSubmit={submit} noValidate aria-label={charge ? "Edit charge" : "Add a charge"}>
      <div className="row4">
        <div className="field">
          <label htmlFor={`ck-${charge?.id || "new"}`}>Type</label>
          {isRent ? (
            <input id={`ck-${charge.id}`} value="Rent" disabled />
          ) : (
            <select id={`ck-${charge?.id || "new"}`} value={form.kind} onChange={set("kind")}>
              {MANUAL_CHARGE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {CHARGE_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="field">
          <label htmlFor={`cm-${charge?.id || "new"}`}>Month</label>
          <input id={`cm-${charge?.id || "new"}`} type="month" value={form.month} onChange={set("month")} />
        </div>
        <div className="field">
          <label htmlFor={`ca-${charge?.id || "new"}`}>Amount</label>
          <input id={`ca-${charge?.id || "new"}`} inputMode="decimal" value={form.amount} onChange={set("amount")} />
        </div>
        <div className="field">
          <label htmlFor={`cd-${charge?.id || "new"}`}>Description</label>
          <input
            id={`cd-${charge?.id || "new"}`}
            value={form.description}
            onChange={set("description")}
            placeholder="e.g. Drain repair chargeback"
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
          {busy ? "Saving…" : charge ? "Save charge" : "Add charge"}
        </button>
        <button type="button" className="btn ghost sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function PaymentEditForm({ payment, onCancel, onSaved }) {
  const [form, setForm] = useState(() => ({
    date: payment.received_on,
    amount: String(Number(payment.amount)),
    method: payment.method,
    kind: payment.kind,
    month: payment.period ? String(payment.period).slice(0, 7) : "",
    receivedBy: payment.received_by || "",
    notes: payment.notes || "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const id = payment.id;

  async function submit(e) {
    e.preventDefault();
    const problem = checkAmount(form.amount);
    if (problem) return setError(problem);
    if (!form.date) return setError("Add the date received.");
    setBusy(true);
    setError("");
    try {
      await savePayment(id, {
        received_on: form.date,
        amount: Math.round(Number(form.amount) * 100) / 100,
        method: form.method,
        kind: form.kind,
        period: periodOf(form.month),
        received_by: form.receivedBy.trim() || null,
        notes: form.notes.trim() || null,
      });
      await onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate aria-label="Edit payment">
      <div className="row4">
        <div className="field">
          <label htmlFor={`pd-${id}`}>Date received</label>
          <input id={`pd-${id}`} type="date" value={form.date} onChange={set("date")} />
        </div>
        <div className="field">
          <label htmlFor={`pa-${id}`}>Amount</label>
          <input id={`pa-${id}`} inputMode="decimal" value={form.amount} onChange={set("amount")} />
        </div>
        <div className="field">
          <label htmlFor={`pm-${id}`}>Method</label>
          <select id={`pm-${id}`} value={form.method} onChange={set("method")}>
            {Object.entries(METHOD_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`pk-${id}`}>What it&apos;s for</label>
          <select id={`pk-${id}`} value={form.kind} onChange={set("kind")}>
            {Object.entries(PAYMENT_KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row3">
        <div className="field">
          <label htmlFor={`pp-${id}`}>Rent month</label>
          <input id={`pp-${id}`} type="month" value={form.month} onChange={set("month")} />
        </div>
        <div className="field">
          <label htmlFor={`pb-${id}`}>Received by</label>
          <input id={`pb-${id}`} value={form.receivedBy} onChange={set("receivedBy")} />
        </div>
        <div className="field">
          <label htmlFor={`pn-${id}`}>Notes</label>
          <input id={`pn-${id}`} value={form.notes} onChange={set("notes")} />
        </div>
      </div>
      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}
      <div className="req-actions">
        <button type="submit" className="btn primary sm" disabled={busy}>
          {busy ? "Saving…" : "Save payment"}
        </button>
        <button type="button" className="btn ghost sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
