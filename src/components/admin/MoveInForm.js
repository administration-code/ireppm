"use client";

import { useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { UNIT_STATUS, createTenancy, orNull, todayISO, wholeDollars } from "@/lib/admin-properties";

export default function MoveInForm({ app }) {
  const [open, setOpen] = useState(false);
  const [properties, setProperties] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({ propertyId: "", unitId: "", start_date: todayISO(), rent: "", rent_due_day: "1" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const ids = (k) => `mi-${k}-${app.id}`;

  async function start() {
    setOpen(true);
    if (properties) return;
    const { data, error: err } = await getBrowserClient()
      .from("properties")
      .select("id, address, city, units(id, label, status, market_rent)")
      .eq("archived", false)
      .order("address");
    if (err) setLoadError("We couldn't load the properties. Try again.");
    else setProperties(data || []);
  }

  const property = properties?.find((p) => p.id === form.propertyId);
  const units = [...(property?.units || [])].sort((a, b) => a.label.localeCompare(b.label, "en-CA", { numeric: true }));

  const pickUnit = (unitId) => {
    const unit = units.find((u) => u.id === unitId);
    setForm((f) => ({ ...f, unitId, rent: unit?.market_rent ? String(unit.market_rent) : f.rent }));
  };

  async function save(e) {
    e.preventDefault();
    setError("");
    const day = Number(form.rent_due_day);
    const problem = !form.unitId
      ? "Choose the property and unit."
      : !form.start_date
        ? "Add the start date."
        : wholeDollars(form.rent, "monthly rent", { required: true }) ||
          (!Number.isInteger(day) || day < 1 || day > 28 ? "Rent due day must be a number from 1 to 28." : "");
    if (problem) return setError(problem);

    setSaving(true);
    try {
      const created = await createTenancy({
        unitId: form.unitId,
        tenancy: {
          start_date: form.start_date,
          rent: parseInt(form.rent, 10),
          rent_due_day: day,
          application_id: app.id,
        },
        tenants: [
          {
            full_name: app.applicant_name,
            email: orNull(app.applicant_email),
            phone: orNull(app.applicant_phone),
            profile_id: app.user_id || null,
            is_primary: true,
          },
        ],
      });
      setDone({ unitId: form.unitId, status: created.status });
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  }

  if (done) {
    return (
      <div className="okbox" role="status">
        {app.applicant_name} {done.status === "active" ? "has moved in" : "is booked to move in"}.{" "}
        <Link href={`/admin/units/${done.unitId}`}>Open the tenancy</Link>
      </div>
    );
  }

  if (!open) {
    return (
      <div>
        <button type="button" className="btn primary sm" onClick={start}>
          Move in<span className="visually-hidden"> {app.applicant_name}</span>
        </button>
      </div>
    );
  }

  return (
    <form className="confirm-box stack" onSubmit={save} noValidate aria-label={`Move in ${app.applicant_name}`}>
      <b>Move {app.applicant_name} in</b>
      {loadError ? <div className="warnbox">{loadError}</div> : null}
      {!properties && !loadError ? <p className="small">Loading properties…</p> : null}
      {properties && properties.length === 0 ? (
        <p className="small">
          No properties yet. <Link href="/admin/properties/new">Add a property</Link> first.
        </p>
      ) : null}
      {properties?.length ? (
        <>
          <div className="row2">
            <div className="field">
              <label htmlFor={ids("prop")}>Property</label>
              <select
                id={ids("prop")}
                value={form.propertyId}
                onChange={(e) => setForm((f) => ({ ...f, propertyId: e.target.value, unitId: "" }))}
              >
                <option value="">Choose a property</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {[p.address, p.city].filter(Boolean).join(", ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={ids("unit")}>Unit</label>
              <select id={ids("unit")} value={form.unitId} onChange={(e) => pickUnit(e.target.value)} disabled={!property}>
                <option value="">{property && !units.length ? "This property has no units" : "Choose a unit"}</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id} disabled={u.status === "occupied"}>
                    {u.label} ({UNIT_STATUS[u.status] || u.status})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="row3">
            <div className="field">
              <label htmlFor={ids("start")}>Start date</label>
              <input
                id={ids("start")}
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor={ids("rent")}>Monthly rent (CAD)</label>
              <input
                id={ids("rent")}
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={form.rent}
                onChange={(e) => setForm((f) => ({ ...f, rent: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor={ids("due")}>Rent due day (1–28)</label>
              <input
                id={ids("due")}
                type="number"
                inputMode="numeric"
                min="1"
                max="28"
                value={form.rent_due_day}
                onChange={(e) => setForm((f) => ({ ...f, rent_due_day: e.target.value }))}
              />
            </div>
          </div>
        </>
      ) : null}
      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}
      <div className="req-actions">
        {properties?.length ? (
          <button type="submit" className="btn primary sm" disabled={saving}>
            {saving ? "Starting…" : "Start tenancy"}
          </button>
        ) : null}
        <button type="button" className="btn ghost sm" onClick={() => setOpen(false)} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
