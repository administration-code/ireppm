"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { currentTenancy, orNull, propertyTitle } from "@/lib/admin-properties";
import {
  SPECIAL_UNITS,
  SPECIAL_VALUE,
  currentTenants,
  ensureSpecialUnit,
  regularUnits,
  specialKind,
} from "@/lib/maintenance-units";
import ReporterPicker from "./ReporterPicker";

const PROPS_SELECT =
  "id, address, city, archived, units(id, label, tenancies(id, status, tenancy_tenants(full_name, email, phone, is_primary)))";

// Change who reported a request and which unit it's for (including whole property / other).
export default function ReporterEditor({ request, onSaved, onCancel }) {
  const [properties, setProperties] = useState(null);
  const startKind = specialKind(request.unit);
  const [f, setF] = useState({
    property_id: request.unit?.property?.id || "",
    unit_id: startKind ? SPECIAL_VALUE[startKind] : request.unit_id,
    reporter_name: request.reporter_name || "",
    reporter_phone: request.reporter_phone || "",
    reporter_email: request.reporter_email || "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .from("properties")
      .select(PROPS_SELECT)
      .eq("archived", false)
      .order("address")
      .then(({ data }) => alive && setProperties(data || []));
    return () => {
      alive = false;
    };
  }, []);

  if (!properties) return <p className="small">Loading tenants…</p>;

  const property = properties.find((p) => p.id === f.property_id);
  const units = regularUnits(property?.units || []);
  const special = Object.keys(SPECIAL_VALUE).find((k) => SPECIAL_VALUE[k] === f.unit_id) || null;
  const unit = special ? null : units.find((u) => u.id === f.unit_id) || null;
  const tenants = currentTenants(properties);
  const set = (k) => (e) => {
    setF((s) => ({ ...s, [k]: e.target.value }));
    setMsg("");
  };

  function pick(t) {
    setF((s) => ({
      ...s,
      property_id: t.property_id,
      unit_id: s.property_id === t.property_id && special ? s.unit_id : t.unit_id,
      reporter_name: t.name,
      reporter_phone: t.phone,
      reporter_email: t.email,
    }));
    setMsg("");
  }

  async function save() {
    if (!property || (!unit && !special)) return setMsg("Choose the property and unit.");
    if (f.reporter_email.trim() && !/^\S+@\S+\.\S+$/.test(f.reporter_email.trim())) return setMsg("Check the email address.");
    setSaving(true);
    const sb = getBrowserClient();
    let unitId = unit?.id;
    try {
      if (special) unitId = await ensureSpecialUnit(sb, property.id, special);
    } catch {
      setSaving(false);
      return setMsg("We couldn't set up that option for this property. Try again.");
    }
    const tenancy = unit ? currentTenancy(unit.tenancies || []) : null;
    const sameUnit = unitId === request.unit_id;
    const { error } = await sb
      .from("maintenance_requests")
      .update({
        unit_id: unitId,
        // Keep the original tenancy if the unit didn't change (it may be a past tenancy now).
        tenancy_id: sameUnit ? request.tenancy_id : tenancy?.id || null,
        reporter_name: orNull(f.reporter_name),
        reporter_phone: orNull(f.reporter_phone),
        reporter_email: orNull(f.reporter_email),
      })
      .eq("id", request.id);
    setSaving(false);
    if (error) return setMsg("We couldn't save the change. Try again.");
    onSaved();
  }

  return (
    <div className="stack confirm-box" style={{ gap: 12 }}>
      <h3 className="sub-title">Change Reporter or Unit</h3>
      <ReporterPicker tenants={tenants} propertyId={f.property_id} onPick={pick} idPrefix="re-rp" />
      <div className="stack" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="re-prop">Property</label>
          <select id="re-prop" value={f.property_id} onChange={(e) => setF((s) => ({ ...s, property_id: e.target.value, unit_id: "" }))}>
            <option value="">Choose a property</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {propertyTitle(p)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="re-unit">Unit</label>
          <select id="re-unit" value={f.unit_id || ""} onChange={set("unit_id")} disabled={!property}>
            <option value="">Choose a unit</option>
            {units.length ? (
              <optgroup label="Leased units">
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label || "Main unit"}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label="Not one unit">
              {Object.entries(SPECIAL_UNITS).map(([k, v]) => (
                <option key={k} value={SPECIAL_VALUE[k]}>
                  {v.option}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="re-name">Reporter name</label>
        <input id="re-name" value={f.reporter_name} onChange={set("reporter_name")} autoComplete="off" />
      </div>
      <div className="stack" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="re-phone">Phone</label>
          <input id="re-phone" type="tel" value={f.reporter_phone} onChange={set("reporter_phone")} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="re-email">Email</label>
          <input id="re-email" type="email" value={f.reporter_email} onChange={set("reporter_email")} autoComplete="off" />
        </div>
      </div>
      <div className="req-actions">
        <button type="button" className="btn primary sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save reporter"}
        </button>
        <button type="button" className="btn ghost sm" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        {msg ? (
          <span className="small err" role="alert">
            {msg}
          </span>
        ) : null}
      </div>
    </div>
  );
}
