"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { UNIT_FIELDS, UNIT_STATUS, UNIT_TYPES, dollarsOrNull, orNull, text, wholeDollars } from "@/lib/admin-properties";

const MANUAL_STATUSES = ["vacant", "turnover", "offline"];

function toForm(u) {
  return {
    label: text(u?.label),
    unit_type: u?.unit_type || "Apartment",
    beds: u ? text(u.beds) : "1",
    baths: u ? text(u.baths) : "1",
    market_rent: text(u?.market_rent),
    status: u?.status || "vacant",
    notes: text(u?.notes),
  };
}

function validate(f) {
  if (!f.label.trim()) return "Give the unit a label, like Upper, Unit 2 or Room 4.";
  for (const [key, label] of [
    ["beds", "Bedrooms"],
    ["baths", "Bathrooms"],
  ]) {
    if (f[key].trim() === "") continue;
    const n = Number(f[key]);
    if (!Number.isFinite(n) || n < 0 || n > 99) return `${label} must be a number from 0 to 99.`;
  }
  return wholeDollars(f.market_rent, "market rent");
}

export default function UnitForm({ propertyId, unit, onSaved, onCancel }) {
  const isNew = !unit;
  const occupied = unit?.status === "occupied";
  const [form, setForm] = useState(() => toForm(unit));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const id = unit?.id || "new";

  const update = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setError("");
  };

  async function save(e) {
    e.preventDefault();
    const problem = validate(form);
    if (problem) return setError(problem);
    setSaving(true);
    const row = {
      label: form.label.trim(),
      unit_type: form.unit_type,
      beds: form.beds.trim() === "" ? null : Math.round(Number(form.beds) * 10) / 10,
      baths: form.baths.trim() === "" ? null : Math.round(Number(form.baths) * 10) / 10,
      market_rent: dollarsOrNull(form.market_rent),
      notes: orNull(form.notes),
    };
    // Occupied comes from the tenancy, so staff only set the status of empty units.
    if (!occupied) row.status = form.status;

    const sb = getBrowserClient();
    const result = isNew
      ? await sb.from("units").insert({ ...row, property_id: propertyId }).select(UNIT_FIELDS).single()
      : await sb.from("units").update(row).eq("id", unit.id).select(UNIT_FIELDS).single();
    setSaving(false);
    if (result.error) {
      return setError(
        result.error.code === "23505"
          ? `This property already has a unit called “${row.label}”. Use a different label.`
          : "We couldn't save this unit. Check the fields and try again."
      );
    }
    onSaved(result.data);
  }

  return (
    <form className="stack unit-form" onSubmit={save} noValidate aria-label={isNew ? "Add unit" : `Edit ${unit.label}`}>
      <div className="row2">
        <div className="field">
          <label htmlFor={`u-label-${id}`}>Label</label>
          <input id={`u-label-${id}`} value={form.label} onChange={update("label")} placeholder="Upper, Unit 2, Room 4" />
        </div>
        <div className="field">
          <label htmlFor={`u-type-${id}`}>Type</label>
          <select id={`u-type-${id}`} value={form.unit_type} onChange={update("unit_type")}>
            {UNIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row3">
        <div className="field">
          <label htmlFor={`u-beds-${id}`}>Bedrooms</label>
          <input id={`u-beds-${id}`} type="number" inputMode="decimal" min="0" max="99" step="0.5" value={form.beds} onChange={update("beds")} />
        </div>
        <div className="field">
          <label htmlFor={`u-baths-${id}`}>Bathrooms</label>
          <input id={`u-baths-${id}`} type="number" inputMode="decimal" min="0" max="99" step="0.5" value={form.baths} onChange={update("baths")} />
        </div>
        <div className="field">
          <label htmlFor={`u-rent-${id}`}>Market rent (CAD)</label>
          <input id={`u-rent-${id}`} type="number" inputMode="numeric" min="1" step="1" value={form.market_rent} onChange={update("market_rent")} placeholder="1850" />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`u-status-${id}`}>Status</label>
        {occupied ? (
          <p className="small" id={`u-status-${id}`}>
            Occupied. This changes automatically when the tenancy ends.
          </p>
        ) : (
          <select id={`u-status-${id}`} value={form.status} onChange={update("status")}>
            {MANUAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {UNIT_STATUS[s]}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="field">
        <label htmlFor={`u-notes-${id}`}>Notes</label>
        <textarea id={`u-notes-${id}`} value={form.notes} onChange={update("notes")} />
      </div>
      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}
      <div className="req-actions">
        <button type="submit" className="btn primary sm" disabled={saving}>
          {saving ? "Saving…" : isNew ? "Add unit" : "Save unit"}
        </button>
        <button type="button" className="btn ghost sm" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
