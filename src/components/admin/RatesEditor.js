"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { RATE_CATEGORIES, formatRate, orNull, text } from "@/lib/admin-properties";

const RATE_FIELDS = "key, name, category, amount, unit, notes, sort_order";

function RateRow({ rate, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(text(rate.amount));
  const [notes, setNotes] = useState(text(rate.notes));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(e) {
    e.preventDefault();
    const v = amount.trim();
    if (!/^\d+(\.\d{1,4})?$/.test(v)) return setError("Enter a number, like 175 or 0.5.");
    setSaving(true);
    const { data, error: err } = await getBrowserClient()
      .from("service_rates")
      .update({ amount: Number(v), notes: orNull(notes) })
      .eq("key", rate.key)
      .select(RATE_FIELDS)
      .single();
    setSaving(false);
    if (err) return setError("We couldn't save this rate. Try again.");
    onSaved(data);
    setEditing(false);
    setError("");
  }

  if (!editing) {
    return (
      <tr>
        <td>{rate.name}</td>
        <td className="num">{formatRate(rate.amount, rate.unit)}</td>
        <td>{rate.notes || <span className="small">None</span>}</td>
        <td className="r">
          <button type="button" className="btn ghost sm" onClick={() => setEditing(true)}>
            Edit<span className="visually-hidden"> {rate.name}</span>
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="editing-row">
      <td colSpan={4}>
        <form className="stack" onSubmit={save} noValidate aria-label={`Edit ${rate.name}`}>
          <b>{rate.name}</b>
          <div className="row2">
            <div className="field">
              <label htmlFor={`r-amt-${rate.key}`}>Amount ({formatRate(1, rate.unit).replace(/^\$?1(\.00)?\s?/, "") || "number"})</label>
              <input id={`r-amt-${rate.key}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor={`r-notes-${rate.key}`}>Notes</label>
              <input id={`r-notes-${rate.key}`} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          {error ? (
            <div className="warnbox" role="alert">
              {error}
            </div>
          ) : null}
          <div className="req-actions">
            <button type="submit" className="btn primary sm" disabled={saving}>
              {saving ? "Saving…" : "Save rate"}
            </button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => {
                setEditing(false);
                setAmount(text(rate.amount));
                setNotes(text(rate.notes));
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}

export default function RatesEditor() {
  const [state, setState] = useState({ loading: true, rates: [], error: "" });

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .from("service_rates")
      .select(RATE_FIELDS)
      .order("sort_order")
      .then(({ data, error }) => {
        if (!alive) return;
        setState({ loading: false, rates: data || [], error: error ? "We couldn't load the rates. Refresh the page to try again." : "" });
      });
    return () => {
      alive = false;
    };
  }, []);

  const { loading, rates, error } = state;
  const saveRate = (saved) => setState((s) => ({ ...s, rates: s.rates.map((r) => (r.key === saved.key ? saved : r)) }));
  const groups = Object.keys(RATE_CATEGORIES)
    .map((cat) => ({ cat, rates: rates.filter((r) => r.category === cat) }))
    .filter((g) => g.rates.length);
  const other = rates.filter((r) => !(r.category in RATE_CATEGORIES));
  if (other.length) groups.push({ cat: "other", rates: other });

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <Link className="eyebrow back-link" href="/admin">
          ← Requests inbox
        </Link>
        <h1 className="admin-title">Add-ons &amp; rates</h1>
        <p className="small">
          IRep&apos;s standard prices. Changing a rate here doesn&apos;t change any property&apos;s monthly fee or custom add-on price.
        </p>
      </div>

      {error ? <div className="warnbox">{error}</div> : null}

      {loading ? (
        <p className="small">Loading rates…</p>
      ) : groups.length === 0 && !error ? (
        <div className="empty">
          <h2>No rates yet</h2>
          <p>Rates are added in the database.</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.cat} className="stack" aria-labelledby={`rates-${g.cat}`}>
            <h2 id={`rates-${g.cat}`} className="sec-title">
              {RATE_CATEGORIES[g.cat] || "Other"}
            </h2>
            <div className="list table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Service</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Notes</th>
                    <th scope="col" className="r">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {g.rates.map((r) => (
                    <RateRow key={r.key} rate={r} onSaved={saveRate} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
