"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { propertyTitle } from "@/lib/admin-properties";
import { isSpecialUnit } from "@/lib/maintenance-units";

// Move a draft lease to another property/unit: updates the property and landlord fields in DocuSign.
export default function MoveLease({ row, busy, onMove, onCancel }) {
  const [props, setProps] = useState(null);
  const [f, setF] = useState({ property_id: row.property_id || "", unit_id: row.unit_id || "", landlord_name: "", signer_name: "", signer_email: "" });

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .from("properties")
      .select("id, address, city, archived, owner_name, owner:owners(id, name, email), units(id, label, status)")
      .eq("archived", false)
      .order("address")
      .then(({ data }) => alive && setProps(data || []));
    return () => {
      alive = false;
    };
  }, []);

  const property = (props || []).find((p) => p.id === f.property_id);
  const units = (property?.units || [])
    .filter((u) => !isSpecialUnit(u))
    .sort((a, b) => String(a.label).localeCompare(String(b.label), "en-CA", { numeric: true }));

  function pickProperty(id) {
    const p = (props || []).find((x) => x.id === id);
    const only = (p?.units || []).filter((u) => !isSpecialUnit(u));
    setF({
      property_id: id,
      unit_id: only.length === 1 ? only[0].id : "",
      landlord_name: p?.owner?.name || p?.owner_name || "",
      signer_name: p?.owner?.name || "",
      signer_email: p?.owner?.email || "",
    });
  }

  useEffect(() => {
    // Prefill the landlord from the current property once properties load.
    if (props && f.property_id && !f.landlord_name) {
      const p = props.find((x) => x.id === f.property_id);
      if (p) setF((s) => ({ ...s, landlord_name: p.owner?.name || p.owner_name || "", signer_name: p.owner?.name || "", signer_email: p.owner?.email || "" }));
    }
  }, [props]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  if (!props) return <p className="small">Loading properties…</p>;

  return (
    <form
      className="stack confirm-box"
      style={{ gap: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        onMove(f);
      }}
    >
      <h3 className="sub-title">Change Property or Unit</h3>
      <p className="small">
        Updates the address, the landlord&apos;s legal name and the landlord signer in the DocuSign draft. Tenants, rent, dates
        and everything else stay as they are.
      </p>
      <div className="row2">
        <div className="field">
          <label htmlFor="mv-prop">Property</label>
          <select id="mv-prop" value={f.property_id} onChange={(e) => pickProperty(e.target.value)}>
            <option value="">Choose a property</option>
            {props.map((p) => (
              <option key={p.id} value={p.id}>
                {propertyTitle(p)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="mv-unit">Unit</label>
          <select id="mv-unit" value={f.unit_id} onChange={set("unit_id")} disabled={!property}>
            <option value="">Choose a unit</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label || "Main unit"}
                {u.status === "offline" ? " (offline)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="mv-ll">Landlord&apos;s legal name (on the lease)</label>
        <input id="mv-ll" value={f.landlord_name} onChange={set("landlord_name")} />
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="mv-sn">Landlord signer name</label>
          <input id="mv-sn" value={f.signer_name} onChange={set("signer_name")} />
        </div>
        <div className="field">
          <label htmlFor="mv-se">Landlord signer email</label>
          <input id="mv-se" type="email" value={f.signer_email} onChange={set("signer_email")} />
        </div>
      </div>
      <div className="req-actions">
        <button type="submit" className="btn primary sm" disabled={Boolean(busy) || !f.unit_id}>
          {busy === "move" ? "Updating…" : "Update lease"}
        </button>
        <button type="button" className="btn ghost sm" onClick={onCancel} disabled={Boolean(busy)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
