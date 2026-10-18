"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { dollars, parseAmount, staffMessage } from "@/lib/accounting";
import { shortDate } from "@/lib/rent";

export const ENTRY_CATEGORIES = [
  ["rent", "Rent collected"],
  ["rent_direct", "Rent paid to you directly"],
  ["management_fee", "Management fee"],
  ["management_hst", "HST on management"],
  ["leasing_fee", "Leasing fee"],
  ["leasing_hst", "HST on leasing"],
  ["repairs", "Repairs"],
  ["other_expense", "Other expense"],
  ["paid_out", "Paid to you"],
];
const CATEGORY_NAME = Object.fromEntries(ENTRY_CATEGORIES);

export default function EarlierEntries({ properties, year, onChange }) {
  const id = useId();
  const ids = properties.map((p) => p.property_id);
  const idKey = ids.join(",");
  const [entries, setEntries] = useState([]);
  const [f, setF] = useState({ property_id: ids[0] || "", category: "rent", amount: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!idKey) return setEntries([]);
    const { data } = await getBrowserClient()
      .from("landlord_year_entries")
      .select("id, property_id, category, amount, note, created_at")
      .eq("year", year)
      .in("property_id", idKey.split(","))
      .order("created_at");
    setEntries(data || []);
  }, [idKey, year]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const address = (pid) => properties.find((p) => p.property_id === pid)?.address || "Property";

  async function add(e) {
    e.preventDefault();
    setError("");
    const amount = parseAmount(f.amount);
    if (!f.property_id) return setError("Choose a property.");
    if (amount == null || amount <= 0) return setError("Enter an amount above zero.");
    setBusy(true);
    const { error: err } = await getBrowserClient()
      .from("landlord_year_entries")
      .insert({ property_id: f.property_id, year, category: f.category, amount: Math.abs(amount), note: f.note.trim() || null });
    setBusy(false);
    if (err) return setError(staffMessage(err));
    setF((s) => ({ ...s, amount: "", note: "" }));
    await load();
    onChange?.();
  }

  async function remove(entry) {
    if (!window.confirm(`Delete ${CATEGORY_NAME[entry.category]} ${dollars(entry.amount)}?`)) return;
    setError("");
    const { error: err } = await getBrowserClient().from("landlord_year_entries").delete().eq("id", entry.id);
    if (err) return setError(staffMessage(err, "That didn't delete. Try again."));
    await load();
    onChange?.();
  }

  if (!properties.length) return null;

  return (
    <section className="boxed stack no-print" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="sec-title">
        Add Figures from Before the Website
      </h2>
      <p className="small">
        Our system starts in September 2026. Add each property&apos;s January–August totals from the income spreadsheet so
        the year is complete.
      </p>

      <form className="acct-map-grid" onSubmit={add}>
        <div className="field">
          <label htmlFor={`${id}-prop`}>Property</label>
          <select id={`${id}-prop`} value={f.property_id} onChange={set("property_id")}>
            {properties.map((p) => (
              <option key={p.property_id} value={p.property_id}>
                {p.address}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-cat`}>Category</label>
          <select id={`${id}-cat`} value={f.category} onChange={set("category")}>
            {ENTRY_CATEGORIES.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-amt`}>Amount</label>
          <input id={`${id}-amt`} inputMode="decimal" value={f.amount} onChange={set("amount")} placeholder="0.00" required />
        </div>
        <div className="field">
          <label htmlFor={`${id}-note`}>Note</label>
          <input id={`${id}-note`} value={f.note} onChange={set("note")} placeholder="e.g. Jan–Aug from spreadsheet" />
        </div>
        <div style={{ alignSelf: "end" }}>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      </form>
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}

      {entries.length ? (
        <ul className="acct-mini-list">
          {entries.map((e) => (
            <li key={e.id}>
              <span>
                <b>{address(e.property_id)}</b> · {CATEGORY_NAME[e.category] || e.category}
                {e.note ? <span className="small"> · {e.note}</span> : null}
                <span className="small"> · added {shortDate(String(e.created_at).slice(0, 10))}</span>
              </span>
              <span className="acct-mini-end">
                <b>{dollars(e.amount)}</b>
                <button type="button" className="linkbtn" onClick={() => remove(e)}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small">No earlier figures added for {year} yet.</p>
      )}
    </section>
  );
}
