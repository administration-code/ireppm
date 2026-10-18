"use client";

import { useState } from "react";
import { createTenancy, tenancyForm, tenancyRow, todayISO, validateTenancy, validateTenant } from "@/lib/admin-properties";
import TenancyFields from "./TenancyFields";
import { TenantInputs, tenantRow } from "./TenantsEditor";

const BLANK = { full_name: "", email: "", phone: "" };

export default function StartTenancyForm({ unit, onCreated, onCancel }) {
  const [form, setForm] = useState(() => ({
    ...tenancyForm(null),
    start_date: todayISO(),
    rent: unit.market_rent ? String(unit.market_rent) : "",
  }));
  const [people, setPeople] = useState([BLANK]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(e) {
    e.preventDefault();
    setError("");
    const filled = people.filter((p) => p.full_name.trim() || p.email.trim() || p.phone.trim());
    const problem =
      validateTenancy(form) ||
      (filled.length ? filled.map(validateTenant).find(Boolean) : "Add at least one tenant.");
    if (problem) return setError(problem);

    setSaving(true);
    try {
      await createTenancy({
        unitId: unit.id,
        tenancy: tenancyRow(form),
        tenants: filled.map((p, i) => ({ ...tenantRow(p), is_primary: i === 0 })),
      });
      await onCreated();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form className="boxed stack" onSubmit={save} noValidate aria-labelledby="start-title">
      <h2 id="start-title" className="sec-title">
        Start Tenancy
      </h2>
      <p className="small">
        If the start date is today or earlier, the tenancy starts as active and the unit is marked occupied. A future
        start date is saved as upcoming.
      </p>
      <TenancyFields form={form} setForm={setForm} idPrefix="start" />

      <div className="stack" style={{ gap: 12 }}>
        <h3 className="eyebrow">Tenants</h3>
        {people.map((p, i) => (
          <div key={i} className="stack" style={{ gap: 8 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b>{i === 0 ? "Primary tenant" : `Tenant ${i + 1}`}</b>
              {i > 0 ? (
                <button type="button" className="btn ghost sm" onClick={() => setPeople((ps) => ps.filter((_, j) => j !== i))}>
                  Remove<span className="visually-hidden"> tenant {i + 1}</span>
                </button>
              ) : null}
            </div>
            <TenantInputs
              person={p}
              idPrefix={`start-tenant-${i}`}
              onChange={(next) => setPeople((ps) => ps.map((x, j) => (j === i ? next : x)))}
            />
          </div>
        ))}
        <div>
          <button type="button" className="btn ghost sm" onClick={() => setPeople((ps) => [...ps, BLANK])}>
            Add another tenant
          </button>
        </div>
      </div>

      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}
      <div className="req-actions">
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? "Starting…" : "Start tenancy"}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
