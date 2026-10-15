"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { PROPERTY_SELECT, UNIT_FIELDS, propertyTitle } from "@/lib/admin-properties";
import PropertyAddons from "./PropertyAddons";
import PropertyForm from "./PropertyForm";
import PropertyMaintenance from "./PropertyMaintenance";
import PropertySummary from "./PropertySummary";
import UnitCard from "./UnitCard";
import UnitForm from "./UnitForm";

const UNIT_SELECT = `${UNIT_FIELDS}, tenancies(id, status, rent, tenancy_tenants(full_name, is_primary, created_at))`;

export default function PropertyEditor({ id, initialOwnerId }) {
  const [state, setState] = useState({ loading: true, property: null, units: [], error: "" });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let alive = true;
    const sb = getBrowserClient();
    Promise.all([
      sb.from("properties").select(PROPERTY_SELECT).eq("id", id).maybeSingle(),
      sb.from("units").select(UNIT_SELECT).eq("property_id", id).order("label"),
    ]).then(([p, u]) => {
      if (!alive) return;
      setState({
        loading: false,
        property: p.data,
        units: u.data || [],
        error: p.error || u.error ? "We couldn't load this property. Refresh the page to try again." : "",
      });
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const { loading, property, units, error } = state;

  if (loading) return <p className="small">Loading property…</p>;
  if (!property) {
    return (
      <div className="empty">
        <h2>{error ? "Something went wrong" : "Property not found"}</h2>
        <p>{error || "It may have been removed."}</p>
        <Link className="btn ghost" href="/admin/properties">
          Back to properties
        </Link>
      </div>
    );
  }

  const saveUnit = (saved) =>
    setState((s) => {
      const existing = s.units.find((u) => u.id === saved.id);
      const merged = { ...saved, tenancies: existing?.tenancies || [] };
      const next = existing ? s.units.map((u) => (u.id === saved.id ? merged : u)) : [...s.units, merged];
      return { ...s, units: next.sort((a, b) => a.label.localeCompare(b.label, "en-CA", { numeric: true })) };
    });

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <Link className="back" href="/admin/properties">
          ← All properties
        </Link>
        <div className="admin-head">
          <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
            <span className="eyebrow">Staff · Property</span>
            <h1 className="admin-title">{propertyTitle(property)}</h1>
          </div>
          {property.archived ? <span className="pill us-offline">Archived</span> : null}
        </div>
      </div>

      {error ? <div className="warnbox">{error}</div> : null}

      <PropertySummary property={property} />

      {initialOwnerId ? (
        <div className="okbox" role="status">
          New owner added. Click Save property to link them.
        </div>
      ) : null}

      <PropertyForm
        key={property.id}
        property={property}
        initialOwnerId={initialOwnerId}
        onSaved={(p) => setState((s) => ({ ...s, property: p }))}
      />

      <PropertyAddons propertyId={property.id} />

      <PropertyMaintenance propertyId={property.id} unitIds={units.map((u) => u.id)} />

      <section className="stack" aria-labelledby="sec-units">
        <div className="admin-head">
          <h2 id="sec-units" className="sec-title">
            Units
          </h2>
          {!adding ? (
            <button type="button" className="btn primary sm" onClick={() => setAdding(true)}>
              Add unit
            </button>
          ) : null}
        </div>

        {adding ? (
          <div className="boxed stack">
            <h3 className="unit-label">New unit</h3>
            <UnitForm
              propertyId={property.id}
              onCancel={() => setAdding(false)}
              onSaved={(u) => {
                saveUnit(u);
                setAdding(false);
              }}
            />
          </div>
        ) : null}

        {units.length ? (
          <ul className="unit-grid">
            {units.map((u) => (
              <UnitCard key={u.id} unit={u} propertyId={property.id} onSaved={saveUnit} />
            ))}
          </ul>
        ) : !adding ? (
          <div className="empty">
            <h2>No units yet</h2>
            <p>
              Add the first unit to this property, like &ldquo;Whole house&rdquo;, &ldquo;Upper&rdquo; or &ldquo;Room 1&rdquo;.
              Then you can start a tenancy or create a listing for it.
            </p>
            <button type="button" className="btn ghost" onClick={() => setAdding(true)}>
              Add the first unit
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
