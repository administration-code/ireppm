"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { checkDollars, dollarsOrNull, formatRate, orNull } from "@/lib/admin-properties";
import { money } from "@/lib/format";

const EMPTY = { addon_key: "", monthly_price: "", notes: "" };

export default function PropertyAddons({ propertyId }) {
  const [state, setState] = useState({ loading: true, addons: [], rates: [], error: "" });
  const [form, setForm] = useState(EMPTY);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ kind: "", text: "" });

  useEffect(() => {
    let alive = true;
    const sb = getBrowserClient();
    Promise.all([
      sb.from("property_addons").select("property_id, addon_key, monthly_price, notes").eq("property_id", propertyId),
      sb.from("service_rates").select("key, name, category, amount, unit, sort_order").eq("category", "addon").order("sort_order"),
    ]).then(([a, r]) => {
      if (!alive) return;
      setState({
        loading: false,
        addons: a.data || [],
        rates: r.data || [],
        error: a.error || r.error ? "We couldn't load the add-ons. Refresh the page to try again." : "",
      });
    });
    return () => {
      alive = false;
    };
  }, [propertyId]);

  const { loading, addons, rates, error } = state;
  const rateByKey = Object.fromEntries(rates.map((r) => [r.key, r]));
  const available = rates.filter((r) => !addons.some((a) => a.addon_key === r.key));

  async function add(e) {
    e.preventDefault();
    if (!form.addon_key) return setMsg({ kind: "err", text: "Choose an add-on." });
    const problem = checkDollars(form.monthly_price, "monthly price");
    if (problem) return setMsg({ kind: "err", text: problem });
    setBusy("add");
    const row = {
      property_id: propertyId,
      addon_key: form.addon_key,
      monthly_price: dollarsOrNull(form.monthly_price),
      notes: orNull(form.notes),
    };
    const { data, error: err } = await getBrowserClient()
      .from("property_addons")
      .insert(row)
      .select("property_id, addon_key, monthly_price, notes")
      .single();
    setBusy("");
    if (err) return setMsg({ kind: "err", text: "We couldn't add this add-on. Try again." });
    setState((s) => ({ ...s, addons: [...s.addons, data] }));
    setForm(EMPTY);
    setAdding(false);
    setMsg({ kind: "ok", text: "Add-on added." });
  }

  async function remove(key) {
    const name = rateByKey[key]?.name || key;
    if (!window.confirm(`Remove ${name} from this property?`)) return;
    setBusy(key);
    const { error: err } = await getBrowserClient()
      .from("property_addons")
      .delete()
      .eq("property_id", propertyId)
      .eq("addon_key", key);
    setBusy("");
    if (err) return setMsg({ kind: "err", text: "We couldn't remove this add-on. Try again." });
    setState((s) => ({ ...s, addons: s.addons.filter((a) => a.addon_key !== key) }));
    setMsg({ kind: "ok", text: `${name} removed.` });
  }

  const priceText = (a) => {
    if (a.monthly_price !== null && a.monthly_price !== undefined) return `${money(a.monthly_price)} / month`;
    const r = rateByKey[a.addon_key];
    return r ? `${formatRate(r.amount, r.unit)} (standard)` : "Standard rate";
  };

  return (
    <section className="boxed stack" aria-labelledby="sec-addons">
      <div className="admin-head">
        <h2 id="sec-addons" className="sec-title">
          Add-ons
        </h2>
        {!adding && available.length ? (
          <button type="button" className="btn ghost sm" onClick={() => setAdding(true)}>
            Add add-on
          </button>
        ) : null}
      </div>
      <p className="small">
        Add-ons are added to the monthly fee. Adding or removing one changes the fee from the next statement. Lawn/snow
        is passed on to the contractor.
      </p>

      {error ? <div className="warnbox">{error}</div> : null}

      {loading ? (
        <p className="small">Loading add-ons…</p>
      ) : addons.length ? (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Add-on</th>
                <th scope="col">Price</th>
                <th scope="col">Notes</th>
                <th scope="col" className="r">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {addons.map((a) => {
                const name = rateByKey[a.addon_key]?.name || a.addon_key;
                return (
                  <tr key={a.addon_key}>
                    <td>{name}</td>
                    <td className="num">{priceText(a)}</td>
                    <td>{a.notes || <span className="small">None</span>}</td>
                    <td className="r">
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => remove(a.addon_key)}
                        disabled={busy === a.addon_key}
                      >
                        {busy === a.addon_key ? "Removing…" : "Remove"}
                        <span className="visually-hidden"> {name}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="small">No add-ons on this property.</p>
      )}

      {adding ? (
        <form className="confirm-box stack" onSubmit={add} noValidate aria-label="Add an add-on">
          <div className="row3">
            <div className="field">
              <label htmlFor="ad-key">Add-on</label>
              <select
                id="ad-key"
                value={form.addon_key}
                onChange={(e) => setForm((f) => ({ ...f, addon_key: e.target.value }))}
              >
                <option value="">Choose…</option>
                {available.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name} ({formatRate(r.amount, r.unit)})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ad-price">Monthly price ($)</label>
              <input
                id="ad-price"
                inputMode="decimal"
                value={form.monthly_price}
                onChange={(e) => setForm((f) => ({ ...f, monthly_price: e.target.value }))}
                placeholder="Standard rate"
              />
            </div>
            <div className="field">
              <label htmlFor="ad-notes">Notes</label>
              <input
                id="ad-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <p className="small">Leave the price empty to use the standard rate.</p>
          <div className="req-actions">
            <button type="submit" className="btn primary sm" disabled={busy === "add"}>
              {busy === "add" ? "Adding…" : "Add"}
            </button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => {
                setAdding(false);
                setForm(EMPTY);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {msg.text ? (
        <p className={`small ${msg.kind}`} role={msg.kind === "err" ? "alert" : "status"}>
          {msg.text}
        </p>
      ) : null}
    </section>
  );
}
