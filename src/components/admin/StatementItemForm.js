"use client";

import { useId, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { checkAmount, cents } from "@/lib/rent";
import { DEDUCT_ONLY_KINDS, ITEM_KIND_LABEL } from "@/lib/payouts";

function toForm(item) {
  if (!item) return { kind: "leasing_fee", description: "", amount: "", direction: "deduct" };
  const c = cents(item.amount);
  return {
    kind: item.kind,
    description: item.description || "",
    amount: String(Math.abs(c) / 100),
    direction: c < 0 ? "deduct" : "add",
  };
}

export default function StatementItemForm({ propertyId, period, item, onSaved, onCancel }) {
  const id = useId();
  const [form, setForm] = useState(() => toForm(item));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const deductOnly = DEDUCT_ONLY_KINDS.includes(form.kind);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    const problem = !form.description.trim() ? "Add a description." : checkAmount(form.amount);
    if (problem) return setError(problem);
    setSaving(true);
    setError("");
    const value = Number(form.amount);
    const row = {
      kind: form.kind,
      description: form.description.trim(),
      amount: deductOnly || form.direction === "deduct" ? -value : value,
    };
    const sb = getBrowserClient();
    const { data, error: err } = item
      ? await sb.from("statement_items").update(row).eq("id", item.id).select("id")
      : await sb
          .from("statement_items")
          .insert({ ...row, property_id: propertyId, period: `${period}-01` })
          .select("id");
    setSaving(false);
    if (err || !data?.length) return setError("That didn't save. Try again.");
    if (!item) setForm(toForm(null));
    onSaved();
  }

  return (
    <form className="stack" onSubmit={save} noValidate>
      <div className="row3">
        <div className="field">
          <label htmlFor={`${id}-kind`}>Kind</label>
          <select id={`${id}-kind`} value={form.kind} onChange={set("kind")}>
            {Object.entries(ITEM_KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-desc`}>Description</label>
          <input id={`${id}-desc`} value={form.description} onChange={set("description")} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-amt`}>Amount ($)</label>
          <input
            id={`${id}-amt`}
            inputMode="decimal"
            value={form.amount}
            onChange={set("amount")}
            aria-describedby={`${id}-amt-hint`}
          />
          <span className="small" id={`${id}-amt-hint`}>
            {deductOnly ? "Type a positive number. It's deducted from the owner." : "Choose below whether it adds or deducts."}
          </span>
        </div>
      </div>
      {!deductOnly ? (
        <fieldset className="check-group">
          <legend className="visually-hidden">Adds to or deducts from the owner</legend>
          <div className="req-actions">
            <label className="check-line">
              <input type="radio" name={`${id}-dir`} value="add" checked={form.direction === "add"} onChange={set("direction")} />
              Add to owner
            </label>
            <label className="check-line">
              <input
                type="radio"
                name={`${id}-dir`}
                value="deduct"
                checked={form.direction === "deduct"}
                onChange={set("direction")}
              />
              Deduct
            </label>
          </div>
        </fieldset>
      ) : null}
      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}
      <div className="req-actions">
        <button type="submit" className="btn primary sm" disabled={saving}>
          {saving ? "Saving…" : item ? "Save item" : "Add item"}
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
